import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { CLASSIFIER_TUNING, DRYWASHER_TUNING, HIGHBANKER_TUNING, ROCKER_TUNING, type Classifier, type Drywasher, type Highbanker, type WashTub, type DigSpot, type Creek, type LayerKind, type Rocker, type Sluice, type SluiceStepEvents } from '../sim';

/**
 * Side-on cross-section of the creek bank at one dig spot. The hole's cut face shows the
 * layers as they are exposed; ground below the hole floor stays unknown until dug.
 *
 * Shovel gesture: press in the hole, drag the shovelful to the pan (right) to pan it, to the
 * sluice in the creek (far right) when one is set up here, or to the spoil pile (left) to toss
 * it. With a rocker box, drop it on the rocker standing behind the pan. Click a boulder to pry
 * it; click a flooded hole to bail; tap the sluice or rocker for a close look.
 */

export type ShovelTarget = 'pan' | 'spoil' | 'sluice' | 'classifier' | 'rocker' | 'highbanker' | 'drywasher' | 'trommel';

export interface BankActions {
  shovel(into: ShovelTarget): void;
  pry(): void;
  bail(): void;
  openSluice(): void;
  openClassifier(): void;
  openRocker(): void;
  openHighbanker(): void;
  openDrywasher(): void;
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
  /** Dry gear, on a dry wash: the drywasher behind the classifier, the wash tub beside the pan. */
  private drywasher: Drywasher | null = null;
  private tub: WashTub | null = null;
  /** The highbanker on its stand at the bank edge, where a sluice would sit in the creek. */
  private highbanker: Highbanker | null = null;
  /** The rocker box, standing on the bank behind the pan, when the player has one and the ground allows it. */
  private rocker: Rocker | null = null;
  /** What the crew at this stretch has left for the player: their bucket of concentrate (and poke). */
  private crewBucket = 0;

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

  setDryGear(drywasher: Drywasher | null, tub: WashTub | null): void {
    this.drywasher = drywasher;
    this.tub = tub;
  }

  setHighbanker(highbanker: Highbanker | null): void {
    this.highbanker = highbanker;
  }

  setRocker(rocker: Rocker | null): void {
    this.rocker = rocker;
  }

  setCrewBucket(blackSand: number): void {
    this.crewBucket = blackSand;
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

  /** The drywasher stands on the bank behind the classifier: drop a shovelful up there. */
  private drywasherRect(): { x: number; y: number; w: number; h: number } {
    const pan = this.panRect();
    return { x: pan.x - 130, y: this.surfaceY - 104, w: 100, h: 54 };
  }

  private overDrywasher(x: number, y: number): boolean {
    const r = this.drywasherRect();
    return x > r.x - 14 && x < r.x + r.w + 14 && y > r.y - 20 && y < r.y + r.h + 8;
  }

  /** The rocker stands on the bank behind the pan: drop a shovelful up there to put it on the screen. */
  private rockerRect(): { x: number; y: number; w: number; h: number } {
    const pan = this.panRect();
    return { x: pan.x, y: this.surfaceY - 100, w: 96, h: 50 };
  }

  private overRocker(x: number, y: number): boolean {
    const r = this.rockerRect();
    return x > r.x - 14 && x < r.x + r.w + 14 && y > r.y - 20 && y < r.y + r.h + 8;
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
    if (this.highbanker && this.overSluice(x, y)) {
      this.actions.openHighbanker();
      return;
    }
    if (this.classifier && this.overClassifier(x, y)) {
      this.actions.openClassifier();
      return;
    }
    if (this.rocker && this.overRocker(x, y)) {
      this.actions.openRocker();
      return;
    }
    if (this.drywasher && this.overDrywasher(x, y)) {
      this.actions.openDrywasher();
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
    const { x, y } = e.global;
    const pan = this.panRect();
    const spoil = this.spoilRect();
    const cr = this.classifierRect();
    if (this.drywasher && this.overDrywasher(x, y)) this.actions.shovel('drywasher');
    else if (this.rocker && this.overRocker(x, y)) this.actions.shovel('rocker');
    else if (this.sluice && x > this.sluiceRect().x - 12) this.actions.shovel('sluice');
    else if (this.highbanker && x > this.sluiceRect().x - 12) this.actions.shovel('highbanker');
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
    // Creek on the right: a dry wash has only a sandy bed, and a ravine's far wall is bare rock.
    const site = this.creek.profile.site;
    const creekX = W * 0.8;
    if (site === 'ravine') g.rect(0, 0, W, sy * 0.75).fill(0x4d4a45);
    if (site === 'dryWash') {
      g.rect(creekX, sy + 14, W - creekX, H - sy).fill(0xb8a57c);
      for (let i = 0; i < 30; i++) g.circle(creekX + ((i * 37.3) % (W - creekX)), sy + 24 + ((i * 53.7) % (H - sy - 30)), 2).fill(0x9a8a62);
    } else {
      g.rect(creekX, sy + 14, W - creekX, H - sy).fill(WATER);
      for (let i = 0; i < 6; i++) {
        const y = sy + 30 + i * 22;
        const drift = ((this.time * (site === 'ravine' ? 90 : 40) + i * 53) % (W - creekX)) + creekX;
        g.moveTo(drift, y).lineTo(Math.min(W, drift + 30), y);
      }
      g.stroke({ width: 2, color: 0x7fb3b0, alpha: 0.35 });
    }
    g.rect(0, sy - 4, creekX, 6).fill(site === 'dryWash' ? 0x8a7d5a : site === 'gravelBar' ? 0xa99b76 : site === 'oldDiggings' ? 0x8c8676 : 0x4d6b35);
    // Old workings: the old-timers' tailings heaped along the far bank, grey and washed.
    if (site === 'oldDiggings') {
      // Mounds on the ground at the left, clear of the hole: half-domes of grey washed gravel.
      for (const [cx, rx, ry] of [[W * 0.07, W * 0.08, 30], [W * 0.18, W * 0.06, 20]] as const) {
        const dome: number[] = [];
        for (let a = 0; a <= 16; a++) dome.push(cx - rx * Math.cos((a / 16) * Math.PI), sy - 2 - ry * Math.sin((a / 16) * Math.PI));
        g.poly(dome).fill(0x8c8676);
        for (let r = 0; r < 7; r++) g.circle(cx - rx * 0.7 + r * rx * 0.22, sy - 6 - ((r * 7) % 3) * ry * 0.2, 3.5).fill(0x6d685c);
      }
    }

    this.drawSigns(g, spot);
    this.drawHole(g, spot);
    this.drawSpoil(g, spot);
    this.drawPan(g);
    if (this.classifier) this.drawClassifier(g, this.classifier);
    if (this.rocker) this.drawRocker(g, this.rocker);
    if (this.drywasher) this.drawDrywasher(g, this.drywasher);
    if (this.tub) this.drawTub(g, this.tub);
    if (this.sluice) this.drawSluice(g, this.sluice);
    if (this.crewBucket > 0) this.drawCrewBucket(g);
    if (this.highbanker) this.drawHighbanker(g, this.highbanker);
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

  /**
   * The highbanker in miniature: hopper on a stand at the bank edge, the box running down to the
   * water, the engine on the bank with its hose in the creek. Spray over the hopper while it runs.
   */
  private drawHighbanker(g: Graphics, hb: Highbanker): void {
    const r = this.sluiceRect();
    const hot = this.carrying !== null && this.pointer.x > r.x - 12;
    const top = this.surfaceY - 40;
    g.moveTo(r.x + 8, top + 30).lineTo(r.x + 4, this.surfaceY + 30).moveTo(r.x + 30, top + 34).lineTo(r.x + 34, this.surfaceY + 30).stroke({ width: 3, color: 0x3d2c1c });
    g.poly([r.x + 20, top + 26, r.x + r.w, top + 60, r.x + r.w, top + 70, r.x + 20, top + 36]).fill(0x6b5033).stroke({ width: 1.5, color: 0x3d2c1c });
    g.rect(r.x + 26, top + 30, r.w - 30, 4).fill(lerp(0x5f7a3c, 0x1d1a14, hb.sluice.mossLoading));
    g.poly([r.x, top, r.x + 36, top, r.x + 30, top + 26, r.x + 6, top + 26]).fill(0x7a5a38).stroke({ width: hot ? 3 : 1.5, color: hot ? 0xe6b940 : 0x3d2c1c });
    const fill = Math.min(1, hb.hopperVolume / HIGHBANKER_TUNING.hopperMax);
    if (fill > 0.01) g.poly([r.x + 6, top + 24, r.x + 30, top + 24, r.x + 22, top + 24 - fill * 20, r.x + 12, top + 24 - fill * 18]).fill(0x8b8578);
    if (hb.jammed) g.circle(r.x + 18, top + 16, 6).fill(0x7c786f).stroke({ width: 2, color: 0xe6b940 });
    const spraying = hb.running && hb.primed;
    if (spraying) for (let i = 0; i < 4; i++) g.circle(r.x + 6 + Math.random() * 26, top - 2 + Math.random() * 6, 1.5).fill({ color: 0xcfe8e4, alpha: 0.9 });
    // Engine behind, hose down into the creek.
    const ex = r.x - 36;
    const ey = this.surfaceY - 14;
    g.roundRect(ex, ey, 22, 14, 2).fill(hb.running ? 0xa8412f : 0x6e3a2e);
    g.moveTo(ex + 22, ey + 8).quadraticCurveTo(r.x + 50, this.surfaceY + 40, r.x + 70, this.surfaceY + 50).stroke({ width: 3, color: 0x1e1e1e });
    if (hb.running) g.circle(ex + 16, ey - 6 - (this.time * 20) % 10, 3).fill({ color: 0x6a6660, alpha: 0.5 });
  }

  /** The drywasher in miniature: screen over a sloped tray, bellows beneath, the drawer filling. */
  private drawDrywasher(g: Graphics, dw: Drywasher): void {
    const r = this.drywasherRect();
    const hot = this.carrying !== null && this.overDrywasher(this.pointer.x, this.pointer.y);
    g.moveTo(r.x + 16, r.y + 30).lineTo(r.x + 14, r.y + r.h).moveTo(r.x + r.w - 12, r.y + 40).lineTo(r.x + r.w - 10, r.y + r.h).stroke({ width: 3, color: 0x3d2c1c });
    g.poly([r.x + 6, r.y + 22, r.x + r.w, r.y + 36, r.x + r.w, r.y + 42, r.x + 6, r.y + 28]).fill(0x7a5a38).stroke({ width: hot ? 3 : 1.5, color: hot ? 0xe6b940 : 0x3d2c1c });
    g.rect(r.x + 20, r.y + 34, 30, 10).fill(0x5e4a33);
    g.rect(r.x + r.w - 24, r.y + 42, 20, 6).fill(lerp(0x7a5a38, 0x1d1a14, dw.drawerLoading));
    g.rect(r.x - 2, r.y, 32, 20).stroke({ width: 2, color: 0x3d2c1c });
    const heap = Math.min(1, dw.hopperVolume / DRYWASHER_TUNING.hopperMax);
    if (heap > 0.01) g.poly([r.x + 1, r.y + 18, r.x + 27, r.y + 18, r.x + 19, r.y + 18 - heap * 16, r.x + 8, r.y + 18 - heap * 14]).fill(0x8b8578);
  }

  /** The wash tub beside the pan: its water level, and how muddy it has got. */
  private drawTub(g: Graphics, tub: WashTub): void {
    const p = this.panRect();
    const x = p.x + p.w + 12;
    const y = this.surfaceY - 30;
    g.poly([x, y, x + 46, y, x + 40, y + 30, x + 6, y + 30]).fill(0x8d8f91).stroke({ width: 2, color: 0x55585b });
    if (tub.water > 0.01) {
      const top = y + 28 - tub.water * 24;
      g.rect(x + 7, top, 32, y + 28 - top).fill({ color: lerp(0x4f8a8c, 0x6b5a3a, tub.turbidity), alpha: 0.9 });
    }
  }

  /** The rocker in miniature: box on its runners, gravel on the screen, water in the box, the apron darkening. */
  private drawRocker(g: Graphics, rocker: Rocker): void {
    const r = this.rockerRect();
    const hot = this.carrying !== null && this.overRocker(this.pointer.x, this.pointer.y);
    const floor = r.y + r.h - 12;
    g.moveTo(r.x + 6, floor + 2).quadraticCurveTo(r.x + 30, floor + 14, r.x + 54, floor + 2).stroke({ width: 3, color: 0x3d2c1c });
    g.moveTo(r.x + 44, floor + 2).quadraticCurveTo(r.x + 68, floor + 14, r.x + 92, floor + 2).stroke({ width: 3, color: 0x3d2c1c });
    g.poly([r.x, r.y + 18, r.x + r.w, r.y + 26, r.x + r.w, floor, r.x, floor - 4]).fill(0x7a5a38).stroke({ width: hot ? 3 : 1.5, color: hot ? 0xe6b940 : 0x3d2c1c });
    g.rect(r.x + 30, floor - 8, r.w - 36, 4).fill(lerp(0xb9ab86, 0x2a241c, rocker.apronLoading));
    if (rocker.water > 0.05) g.rect(r.x + 28, floor - 4 - Math.min(14, rocker.water * 14), r.w - 30, Math.min(14, rocker.water * 14)).fill({ color: 0x4f8a8c, alpha: 0.55 });
    // Hopper at the high end.
    g.rect(r.x - 2, r.y, 30, 20).stroke({ width: 2, color: 0x3d2c1c });
    const heap = Math.min(1, rocker.hopperVolume / ROCKER_TUNING.hopperMax);
    if (heap > 0.01) g.poly([r.x + 1, r.y + 18, r.x + 25, r.y + 18, r.x + 18, r.y + 18 - heap * 16, r.x + 8, r.y + 18 - heap * 14]).fill(0x8b8578);
    for (let i = 0; i < Math.min(4, rocker.hopperRocks); i++) g.circle(r.x + 6 + i * 6, r.y + 12 - heap * 10, 3).fill(0x7c786f);
  }

  /** The crew's bucket of concentrate, on the bank between the spoil pile and the hole on the bank by the sluice header, dark to the fill line. */
  private drawCrewBucket(g: Graphics): void {
    const spoil = this.spoilRect();
    const x = spoil.x + spoil.w + 6;
    const y = this.surfaceY - 30;
    const fill = Math.min(1, this.crewBucket / 4);
    g.poly([x, y, x + 26, y, x + 22, y + 28, x + 4, y + 28]).fill(0x7c7d80).stroke({ width: 1.5, color: 0x3b3c3f });
    const top = y + 28 - fill * 26;
    g.poly([x + 4, top, x + 22, top, x + 22, y + 27, x + 4, y + 27]).fill(0x1d1a14);
    g.moveTo(x + 2, y).quadraticCurveTo(x + 13, y - 14, x + 24, y).stroke({ width: 1.5, color: 0x3b3c3f });
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
