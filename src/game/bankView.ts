import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { DigSpot, Creek, LayerKind } from '../sim';

/**
 * Side-on cross-section of the creek bank at one dig spot. The hole's cut face shows the
 * layers as they are exposed; ground below the hole floor stays unknown until dug.
 *
 * Shovel gesture: press in the hole, drag the shovelful to the pan (right) to pan it, or to
 * the spoil pile (left) to toss it. Click a boulder to pry it; click a flooded hole to bail.
 */

export interface BankActions {
  shovel(into: 'pan' | 'spoil'): void;
  pry(): void;
  bail(): void;
}

const LAYER_COLORS: Record<LayerKind | 'slump', number> = {
  overburden: 0x6b5236,
  gravel: 0x8b8578,
  payStreak: 0x4a3b2e,
  bedrock: 0x4d5560,
  slump: 0x76603f,
};
const UNKNOWN_GROUND = 0x3a2e20;
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

  landed(into: 'pan' | 'spoil', from: LayerKind | 'slump'): void {
    // A shovelful into the pan switches straight to panning, so only the spoil pile gets flying dirt.
    if (into === 'pan') return;
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

  private spoilRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.width_ * 0.06, y: this.surfaceY - 60, w: this.width_ * 0.2, h: 60 };
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
    if (x > pan.x - 40) this.actions.shovel('pan');
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
    const hot = this.carrying && this.pointer.x > p.x - 40;
    g.poly([p.x, p.y, p.x + p.w, p.y, p.x + p.w - 18, p.y + p.h, p.x + 18, p.y + p.h]).fill(0x2c2b29).stroke({ width: 3, color: hot ? 0xe6b940 : 0x4b4944 });
    const s = this.spoilRect();
    if (this.carrying && this.pointer.x < s.x + s.w + 30) {
      g.rect(s.x, this.surfaceY - 3, s.w, 3).fill(0xe6b940);
    }
  }

  private drawShovel(g: Graphics): void {
    const at = this.carrying
      ? this.pointer
      : { x: this.holeX + this.holeWidth / 2 + 36, y: this.surfaceY + 6 };
    const handleTop = { x: at.x + 40, y: at.y - 120 };
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
