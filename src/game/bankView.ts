import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { CLASSIFIER_TUNING, type Classifier, type DigSpot, type Creek, type LayerKind, type Sluice, type SluiceStepEvents } from '../sim';

/**
 * Side-on cross-section of the creek bank at one dig spot. The hole's cut face shows the
 * layers as they are exposed; ground below the hole floor stays unknown until dug.
 *
 * Shovel gesture: press in the hole, drag the shovelful to the pan (right) to pan it, to the
 * sluice in the creek (far right) when one is set up here, or to the spoil pile (left) to toss
 * it. Click a boulder to pry it; click a flooded hole to bail; tap the sluice for a close look.
 */

export type ShovelTarget = 'pan' | 'spoil' | 'sluice' | 'classifier';

export interface BankActions {
  shovel(into: ShovelTarget): void;
  pry(): void;
  bail(): void;
  openSluice(): void;
  openClassifier(): void;
}

const LAYER_COLORS: Record<LayerKind | 'slump', number> = {
  overburden: 0x6b5236,
  gravel: 0x8b8578,
  payStreak: 0x4a3b2e,
  bedrock: 0x4d5560,
  slump: 0x76603f,
};
const UNKNOWN_GROUND = 0x3a2e20;

function lerp(a: number, b: number, t: number): number {
  const ch = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * Math.min(1, Math.max(0, t))) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}
const SKY_BANK = 0x5b5236;
const WATER = 0x2f5a5e;

interface Clod {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
}

export class BankView extends Container {
  private readonly g = new Graphics();
  private readonly fx = new Graphics();
  private width_ = 800;
  private height_ = 600;
  private spot: DigSpot | null = null;
  private carrying: { x: number; y: number; color: number } | null = null;
  private pointer = { x: 0, y: 0 };
  private boulderWiggle = 0;
  private clods: Clod[] = [];
  private time = 0;
  /** The sluice running in the creek beside this spot, if there is one, and its last step. */
  private sluice: Sluice | null = null;
  private sluiceEvents: SluiceStepEvents | null = null;
  /** The classifier on its bucket beside the hole, when the player has one and the ground allows it. */
  private classifier: Classifier | null = null;

  constructor(
    private creek: Creek,
    private readonly actions: BankActions,
  ) {
    super();
    this.addChild(this.g, this.fx);
    this.eventMode = 'static';
    this.on('pointerdown', this.handleDown, this);
    this.on('globalpointermove', this.handleMove, this);
    this.on('pointerup', this.handleUp, this);
    this.on('pointerupoutside', this.handleUp, this);
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
  }

  setSpot(creek: Creek, spot: DigSpot): void {
    if (spot !== this.spot) this.clods = [];
    this.creek = creek;
    this.spot = spot;
  }

  /** Shake the boulder after a pry, and throw dirt when a shovelful lands. */
  pried(): void {
    this.boulderWiggle = 0.3;
  }

  landed(into: ShovelTarget, from: LayerKind | 'slump'): void {
    // A shovelful into the pan switches straight to panning, and the sluice shows its own feed,
    // so only the spoil pile gets flying dirt.
    if (into !== 'spoil') return;
    const target = this.spoilRect();
    for (let i = 0; i < 14; i++) {
      this.clods.push({
        x: target.x + target.w / 2 + (Math.random() - 0.5) * 30,
        y: target.y - 20,
        vx: (Math.random() - 0.5) * 80,
        vy: -60 - Math.random() * 60,
        life: 0.5,
        color: LAYER_COLORS[from],
      });
    }
  }

  setClassifier(classifier: Classifier | null): void {
    this.classifier = classifier;
  }

  setSluice(sluice: Sluice | null, events: SluiceStepEvents | null): void {
    this.sluice = sluice;
    if (events) this.sluiceEvents = events;
    if (!sluice) this.sluiceEvents = null;
  }

  update(dt: number): void {
    this.time += dt;
    this.boulderWiggle = Math.max(0, this.boulderWiggle - dt);
    for (const c of this.clods) {
      c.vy += 500 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life -= dt;
    }
    this.clods = this.clods.filter((c) => c.life > 0);
    this.draw();
  }

  // ---- geometry ----

  private get surfaceY(): number {
    return this.height_ * 0.3;
  }

  private get holeX(): number {
    return this.width_ * 0.42;
  }

  private get holeWidth(): number {
    return Math.min(this.width_ * 0.2, 220);
  }

  /** Pixels per shovelful of depth, so the full profile fits on screen. */
  private get unit(): number {
    const total = this.spot?.layers.reduce((n, l) => n + l.initialLoads, 0) ?? 20;
    return (this.height_ * 0.6) / Math.max(total, 1);
  }

  /** Depth dug, in shovelfuls: layers are dug in order, so count until the first untouched one. */
  private depthLoads(spot: DigSpot): number {
    let depth = 0;
    for (const layer of spot.layers) {
      depth += layer.initialLoads - layer.loads;
      if (layer.loads > 0) break;
    }
    return depth;
  }

  private holeBottomY(spot: DigSpot): number {
    return this.surfaceY + this.depthLoads(spot) * this.unit;
  }

  private panRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.width_ * 0.66, y: this.surfaceY - 26, w: 110, h: 26 };
  }

  /** The classifier: a screen on a bucket, standing on the bank between the hole and the pan. */
  private classifierRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.width_ * 0.555, y: this.surfaceY - 46, w: 58, h: 46 };
  }

  private overClassifier(x: number, y: number): boolean {
    const r = this.classifierRect();
    return x > r.x - 10 && x < r.x + r.w + 10 && y > r.y - 16 && y < r.y + r.h + 6;
  }

  /** The compact sluice in the creek: header box at the bank edge, running down into the water. */
  private sluiceRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.width_ * 0.81, y: this.surfaceY - 34, w: this.width_ * 0.17, h: 70 };
  }

  private spoilRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.width_ * 0.06, y: this.surfaceY - 60, w: this.width_ * 0.2, h: 60 };
  }

  private overSluice(x: number, y: number): boolean {
    const r = this.sluiceRect();
    return x > r.x - 8 && x < r.x + r.w + 8 && y > r.y - 20 && y < r.y + r.h + 10;
  }

  private inHole(x: number, y: number, spot: DigSpot): boolean {
    const half = this.holeWidth / 2 + 20;
    return Math.abs(x - this.holeX) < half && y > this.surfaceY - 40 && y < this.holeBottomY(spot) + 30;
  }

  // ---- input ----

  private handleDown(e: FederatedPointerEvent): void {
    const spot = this.spot;
    if (!spot) return;
    const { x, y } = e.global;
    this.pointer = { x, y };
    if (this.sluice && this.overSluice(x, y)) {
      this.actions.openSluice();
      return;
    }
    if (this.classifier && this.overClassifier(x, y)) {
      this.actions.openClassifier();
      return;
    }
    if (!this.inHole(x, y, spot)) return;
    const blocked = this.creek.blockedBy(spot);
    if (blocked === 'boulder') {
      this.actions.pry();
    } else if (blocked === 'flooded') {
      this.actions.bail();
    } else if (blocked === null) {
      const layer = spot.slumped > 0 ? 'slump' : (this.creek.currentLayer(spot)?.kind ?? 'overburden');
      this.carrying = { x, y, color: LAYER_COLORS[layer] };
    }
  }

  private handleMove(e: FederatedPointerEvent): void {
    this.pointer = { x: e.global.x, y: e.global.y };
  }

  private handleUp(e: FederatedPointerEvent): void {
    const carrying = this.carrying;
    this.carrying = null;
    if (!carrying) return;
    const { x } = e.global;
    const pan = this.panRect();
    const spoil = this.spoilRect();
    const cr = this.classifierRect();
    if (this.sluice && x > this.sluiceRect().x - 12) this.actions.shovel('sluice');
    else if (x > pan.x - 40) this.actions.shovel('pan');
    else if (this.classifier && x > cr.x - 14 && x < cr.x + cr.w + 14) this.actions.shovel('classifier');
    else if (x < spoil.x + spoil.w + 30) this.actions.shovel('spoil');
    // Released over the hole: the shovelful drops back in.
  }

  // ---- drawing ----

  private draw(): void {
    const g = this.g.clear();
    const spot = this.spot;
    const W = this.width_;
    const H = this.height_;
    const sy = this.surfaceY;
    if (!spot) return;

    // Far bank and sky strip, then the ground in cross-section.
    g.rect(0, 0, W, sy).fill(SKY_BANK);
    g.rect(0, sy, W, H - sy).fill(UNKNOWN_GROUND);
    // Creek on the right.
    const creekX = W * 0.8;
    g.rect(creekX, sy + 14, W - creekX, H - sy).fill(WATER);
    for (let i = 0; i < 6; i++) {
      const y = sy + 30 + i * 22;
      const drift = ((this.time * 40 + i * 53) % (W - creekX)) + creekX;
      g.moveTo(drift, y).lineTo(Math.min(W, drift + 30), y);
    }
    g.stroke({ width: 2, color: 0x7fb3b0, alpha: 0.35 });
    g.rect(0, sy - 4, creekX, 6).fill(0x4d6b35);

    this.drawSigns(g, spot);
    this.drawHole(g, spot);
    this.drawSpoil(g, spot);
    this.drawPan(g);
    if (this.classifier) this.drawClassifier(g, this.classifier);
    if (this.sluice) this.drawSluice(g, this.sluice);
    this.drawShovel(g);

    const fx = this.fx.clear();
    for (const c of this.clods) fx.circle(c.x, c.y, 4).fill({ color: c.color, alpha: Math.min(1, c.life * 3) });
  }

  private drawHole(g: Graphics, spot: DigSpot): void {
    const sy = this.surfaceY;
    const unit = this.unit;
    const half = this.holeWidth / 2;
    const x = this.holeX;
    const bottom = this.holeBottomY(spot);
    // Straight walls, so the cut-face bands line up with the hole edge.
    const taper = 0;

    // Cut face: bands of each exposed layer along both walls.
    let y = sy;
    for (const layer of spot.layers) {
      const dug = layer.initialLoads - layer.loads;
      if (dug <= 0) break;
      const h = dug * unit;
      const color = LAYER_COLORS[layer.kind];
      g.rect(x - half - 16, y, 16, h).fill(color);
      g.rect(x + half, y, 16, h).fill(color);
      if (layer.kind === 'payStreak' || layer.kind === 'gravel') this.speckle(g, x - half - 16, y, 16, h, layer.kind);
      if (layer.kind === 'payStreak' || layer.kind === 'gravel') this.speckle(g, x + half, y, 16, h, layer.kind);
      if (layer.kind === 'bedrock') {
        g.moveTo(x - half - 10, y + 4).lineTo(x - half - 4, y + h * 0.6).moveTo(x + half + 2, y + 2).lineTo(x + half + 8, y + h * 0.7)
          .stroke({ width: 1.5, color: 0x22262c });
      }
      y += h;
      if (layer.loads > 0) break;
    }

    // The open hole.
    if (bottom > sy + 1) {
      g.poly([x - half, sy, x + half, sy, x + half - taper, bottom, x - half + taper, bottom]).fill(0x1b1712);
      // Floor: the layer the next shovelful comes from.
      const floor = this.creek.currentLayer(spot);
      if (floor) g.rect(x - half + taper, bottom - 5, (half - taper) * 2, 5).fill(LAYER_COLORS[floor.kind]);
      if (floor?.kind === 'bedrock') {
        for (let i = 0; i < 4; i++) {
          const cx = x - half + taper + ((i + 0.5) / 4) * (half - taper) * 2;
          g.moveTo(cx - 6, bottom - 5).lineTo(cx, bottom - 1).lineTo(cx + 5, bottom - 6).stroke({ width: 2, color: 0x15181c });
        }
      }
    } else {
      // Undug: mark where to dig.
      g.moveTo(x - half, sy).lineTo(x + half, sy).stroke({ width: 3, color: 0x2a2116, alpha: 0.6 });
    }

    if (spot.slumped > 0) {
      const h = Math.min(bottom - sy, spot.slumped * unit);
      g.poly([x - half + taper, bottom, x + half - taper, bottom, x + half * 0.2, bottom - h, x - half * 0.5, bottom - h * 0.8])
        .fill(LAYER_COLORS.slump);
    }

    if (spot.water > 0 && bottom > sy + 4) {
      const h = spot.water * Math.min(bottom - sy, 70);
      const shimmer = Math.sin(this.time * 3) * 1.5;
      g.rect(x - half + taper, bottom - h + shimmer, (half - taper) * 2, h - shimmer).fill({ color: 0x3f7479, alpha: 0.85 });
    }

    if (spot.boulder) {
      const wiggle = Math.sin(this.boulderWiggle * 60) * this.boulderWiggle * 20;
      const r = Math.min(half * 0.55, 38);
      const by = Math.max(sy, bottom - r * 0.7);
      g.ellipse(x + wiggle, by, r, r * 0.75).fill(0x7c786f).stroke({ width: 2, color: 0x4a4740 });
      const loosened = 1 - spot.boulder.pries / spot.boulder.initialPries;
      if (loosened > 0) g.moveTo(x - r, by + r * 0.6).lineTo(x - r - 10 * loosened, by + r * 0.9).stroke({ width: 3, color: 0x1b1712 });
    }
  }

  private speckle(g: Graphics, x: number, y: number, w: number, h: number, kind: LayerKind): void {
    const count = Math.floor((w * h) / 90);
    for (let i = 0; i < count; i++) {
      const px = x + ((i * 37.7) % w);
      const py = y + ((i * 13.3) % Math.max(h, 1));
      g.circle(px, py, kind === 'gravel' ? 2.2 : 1.4).fill(kind === 'gravel' ? 0xa9a393 : 0x16120f);
    }
  }

  private drawSpoil(g: Graphics, spot: DigSpot): void {
    const r = this.spoilRect();
    const h = Math.min(r.h, 6 + spot.spoil * 5);
    if (spot.spoil === 0) return;
    g.poly([r.x, this.surfaceY, r.x + r.w, this.surfaceY, r.x + r.w * 0.6, this.surfaceY - h, r.x + r.w * 0.35, this.surfaceY - h * 0.9])
      .fill(0x5e4a33);
  }

  private drawPan(g: Graphics): void {
    const p = this.panRect();
    const toSluice = this.sluice !== null && this.pointer.x > this.sluiceRect().x - 12;
    const hot = this.carrying && this.pointer.x > p.x - 40 && !toSluice;
    g.poly([p.x, p.y, p.x + p.w, p.y, p.x + p.w - 18, p.y + p.h, p.x + 18, p.y + p.h]).fill(0x2c2b29).stroke({ width: 3, color: hot ? 0xe6b940 : 0x4b4944 });
    const s = this.spoilRect();
    if (this.carrying && this.pointer.x < s.x + s.w + 30) {
      g.rect(s.x, this.surfaceY - 3, s.w, 3).fill(0xe6b940);
    }
  }

  /** The classifier in miniature: gravel heaped on the screen, the bucket filling beneath. */
  private drawClassifier(g: Graphics, classifier: Classifier): void {
    const r = this.classifierRect();
    const hot = this.carrying !== null && this.pointer.x > r.x - 14 && this.pointer.x < r.x + r.w + 14 && this.pointer.x < this.panRect().x - 40;
    const top = r.y + 12;
    // Bucket, with what it holds showing as a fill line.
    g.poly([r.x + 6, top, r.x + r.w - 6, top, r.x + r.w - 12, r.y + r.h, r.x + 12, r.y + r.h]).fill(0x7a7f86).stroke({ width: 2, color: 0x4d5258 });
    const fill = Math.min(1, classifier.bucketVolume / CLASSIFIER_TUNING.bucketCapacity);
    if (fill > 0) {
      const y = r.y + r.h - (r.h - 14) * fill;
      g.poly([r.x + 12 + 5 * (1 - fill), y, r.x + r.w - 12 - 5 * (1 - fill), y, r.x + r.w - 12, r.y + r.h - 2, r.x + 12, r.y + r.h - 2]).fill(0x8b7a5a);
    }
    // Screen frame and mesh across the top.
    g.rect(r.x, r.y + 4, r.w, 9).fill(0x6b5033).stroke({ width: hot ? 3 : 1.5, color: hot ? 0xe6b940 : 0x3d2c1c });
    const step = classifier.screen === 'fine' ? 4 : 8;
    for (let x = r.x + step; x < r.x + r.w; x += step) g.moveTo(x, r.y + 5).lineTo(x, r.y + 12);
    g.stroke({ width: 1, color: 0x2c2a26, alpha: 0.7 });
    if (classifier.hasLoad) {
      g.poly([r.x + 6, r.y + 5, r.x + r.w - 6, r.y + 5, r.x + r.w * 0.62, r.y - 8, r.x + r.w * 0.35, r.y - 6]).fill(0x8b8578);
      for (let i = 0; i < Math.min(5, classifier.rocks.length); i++) g.circle(r.x + 12 + i * 9, r.y - 2 - (i % 2) * 4, 4).fill(0x7c786f);
    }
  }

  /**
   * The sluice in miniature, readable at a glance: a trickle, a smooth sheet, or whitewater over
   * the riffles; gravel heaped in the header; the moss darkening as it loads.
   */
  private drawSluice(g: Graphics, sluice: Sluice): void {
    const r = this.sluiceRect();
    const events = this.sluiceEvents;
    const power = events?.power ?? 0;
    const hot = this.carrying !== null && this.pointer.x > r.x - 12;
    const x0 = r.x;
    const y0 = r.y + 22;
    const x1 = r.x + r.w;
    const y1 = r.y + r.h;
    // Box and moss.
    g.poly([x0, y0 - 8, x1, y1 - 8, x1, y1 + 4, x0, y0 + 4]).fill(0x6b5033).stroke({ width: hot ? 3 : 1.5, color: hot ? 0xe6b940 : 0x3d2c1c });
    const moss = sluice.mossLoading;
    g.poly([x0 + 18, y0 - 4 + (y1 - y0) * 0.1, x1 - 4, y1 - 5, x1 - 4, y1 + 1, x0 + 18, y0 + 1 + (y1 - y0) * 0.1])
      .fill(lerp(0x5f7a3c, 0x1d1a14, moss));
    // Riffles.
    for (let i = 1; i <= 6; i++) {
      const t = i / 7;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      g.moveTo(x, y - 7).lineTo(x + 2, y + 2).stroke({ width: 2, color: 0x3d2c1c });
    }
    // Water sheet: thickness and colour show the operating state.
    if (power > 0.02) {
      const depth = 2 + power * 7;
      const white = events?.state === 'overpowered';
      g.poly([x0 + 8, y0 - 8 - depth, x1, y1 - 8 - depth * 0.6, x1, y1 - 7, x0 + 8, y0 - 7])
        .fill({ color: white ? 0xdfeee9 : 0x4f8a8c, alpha: white ? 0.75 : 0.6 });
      if (white) {
        for (let i = 0; i < 5; i++) {
          const t = (this.time * 1.7 + i / 5) % 1;
          g.circle(x0 + (x1 - x0) * t, y0 - 12 + (y1 - y0) * t - Math.random() * 6, 1.8).fill({ color: 0xffffff, alpha: 0.8 });
        }
      }
    }
    // Header box with its heap of gravel; overflowing water when jammed.
    const heap = Math.min(1, sluice.headerVolume / 2);
    g.rect(x0 - 4, r.y - 2, 26, 28).fill(0x5a4128).stroke({ width: 1.5, color: 0x3d2c1c });
    if (heap > 0) g.poly([x0 - 2, r.y + 24, x0 + 20, r.y + 24, x0 + 16, r.y + 24 - heap * 26, x0 + 2, r.y + 24 - heap * 22]).fill(0x8b8578);
    if (sluice.jammed || sluice.clog > 0.5) {
      for (let i = 0; i < 4; i++) g.circle(x0 - 6 + Math.random() * 34, r.y - 4 - Math.random() * 10, 2).fill({ color: 0xdfeee9, alpha: 0.8 });
    }
  }

  private drawShovel(g: Graphics): void {
    const at = this.carrying
      ? this.pointer
      : { x: this.holeX - this.holeWidth / 2 - 30, y: this.surfaceY + 6 };
    // Resting, it stands left of the hole leaning away from it; carried, it leans with the swing.
    const handleTop = { x: at.x + (this.carrying ? 40 : -40), y: at.y - 120 };
    g.moveTo(at.x, at.y - 10).lineTo(handleTop.x, handleTop.y).stroke({ width: 5, color: 0x8a6a45 });
    g.moveTo(handleTop.x - 10, handleTop.y).lineTo(handleTop.x + 10, handleTop.y).stroke({ width: 5, color: 0x8a6a45 });
    g.poly([at.x - 14, at.y - 12, at.x + 12, at.y - 8, at.x + 6, at.y + 14, at.x - 10, at.y + 12]).fill(0x5f646a);
    if (this.carrying) g.ellipse(at.x - 1, at.y - 12, 16, 7).fill(this.carrying.color);
  }

  private drawSigns(g: Graphics, spot: DigSpot): void {
    const sy = this.surfaceY;
    const x = this.holeX;
    const half = this.holeWidth / 2;
    for (const sign of spot.signs) {
      switch (sign) {
        case 'mossLine':
          for (let i = 0; i < 9; i++) g.circle(x + half + 70 + i * 11, sy - 5 - (i % 2) * 3, 5).fill(0x4f7a3a);
          break;
        case 'blackSandStreak':
          for (let i = 0; i < 4; i++) g.moveTo(x - half + 10 + i * 18, sy - 2).lineTo(x - half + 24 + i * 18, sy - 1).stroke({ width: 3, color: 0x15120f });
          break;
        case 'bedrockOutcrop':
          g.poly([x - half - 70, sy + 2, x - half - 55, sy - 22, x - half - 30, sy - 18, x - half - 20, sy + 2]).fill(0x4d5560);
          break;
        case 'boulderTrap':
          g.ellipse(x + half + 40, sy - 20, 26, 22).fill(0x7c786f);
          for (let i = 0; i < 6; i++) g.circle(x + half + 14 - i * 5, sy - 3 - (i % 2) * 3, 3).fill(0xa9a393);
          break;
        case 'insideBend':
          g.ellipse(this.width_ * 0.78, sy + 8, 50, 10).fill(0xb7a57c);
          break;
      }
    }
  }
}
