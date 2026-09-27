import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import { ROCKER_TUNING, type Rocker, type RockerStroke } from '../sim';

/**
 * Close-up of the rocker box, side on. The box swings on its curved rockers with each stroke.
 * The player reads it by eye: gravel and rocks on the screen at the top, water standing in the
 * box (a dry floor, a working sheet, or water slopping over the sides), the canvas apron darkening
 * as it loads, tailings running out the low end, and the bucket's water level beside it. Tap the
 * box to rock it; tap the bucket to ladle.
 */

export interface RockerActions {
  rock(): void;
  ladle(): void;
}

const COLORS = {
  bank: 0x5b5236,
  wood: 0x7a5a38,
  woodDark: 0x3d2c1c,
  screen: 0x2c2a26,
  apron: 0xb9ab86,
  apronFull: 0x2a241c,
  water: 0x4f8a8c,
  foam: 0xe8f2f0,
  bucket: 0x7a7f86,
  bucketDark: 0x4d5258,
  gravel: 0x8b8578,
  rock: 0x7c786f,
  gold: 0xfff0a8,
  sand: [0xc8b891, 0xb3a37e, 0x2a2622],
} as const;

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
  size: number;
}

export class RockerView extends Container {
  private readonly g = new Graphics();
  private readonly fx = new Graphics();
  private readonly fetchLabel = new Text({ text: '', style: { fill: 0xefe6cf, fontSize: 16, fontFamily: 'Georgia, serif' } });
  private width_ = 800;
  private height_ = 600;
  private time = 0;
  /** Current swing, radians, and where each stroke sends it. */
  private swing = 0;
  private swingTo = 0.1;
  private drops: Drop[] = [];
  private glints: { t: number; life: number }[] = [];

  constructor(private readonly actions: RockerActions) {
    super();
    this.fetchLabel.anchor.set(0.5);
    this.addChild(this.g, this.fx, this.fetchLabel);
    this.eventMode = 'static';
    this.on('pointertap', (e: FederatedPointerEvent) => {
      const { x, y } = e.global;
      const b = this.bucketRect();
      if (x > b.x - 12 && x < b.x + b.w + 12 && y > b.y - 30 && y < b.y + b.h + 10) this.actions.ladle();
      else if (this.overBox(x, y)) this.actions.rock();
    });
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
  }

  reset(): void {
    this.drops = [];
    this.glints = [];
  }

  /** A stroke happened: swing the other way, spill tailings, splash if it sloshed. */
  stroked(stroke: RockerStroke): void {
    this.swingTo = -Math.sign(this.swingTo || 1) * 0.1;
    const end = this.boxPoint(1, 0.2);
    const n = Math.min(24, Math.round(stroke.released / 0.004));
    for (let i = 0; i < n; i++) {
      this.drops.push({ x: end.x, y: end.y, vx: 30 + Math.random() * 50, vy: -10 + Math.random() * 20, life: 0.7, color: COLORS.sand[i % 3]!, size: 2 });
    }
    for (let i = 0; i < stroke.goldLost; i++) this.drops.push({ x: end.x, y: end.y - 4, vx: 40 + Math.random() * 40, vy: -20, life: 0.8, color: COLORS.gold, size: 2.5 });
    if (stroke.state === 'sloshing') {
      for (let i = 0; i < 14; i++) {
        const p = this.boxPoint(Math.random(), 1);
        this.drops.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 120, vy: -80 - Math.random() * 100, life: 0.5, color: COLORS.foam, size: 1.8 });
      }
    }
    if (stroke.glint) this.glints.push({ t: 0.3 + Math.random() * 0.6, life: 0.45 });
  }

  /** A ladle poured: water arcs from the bucket onto the screen. */
  poured(): void {
    const b = this.bucketRect();
    const hopper = this.boxPoint(0.1, 1.3);
    for (let i = 0; i < 16; i++) {
      this.drops.push({ x: b.x + b.w / 2, y: b.y - 10, vx: (hopper.x - b.x) * (0.9 + Math.random() * 0.4), vy: -160 - Math.random() * 40, life: 0.7, color: COLORS.water, size: 2.2 });
    }
  }

  update(dt: number, rocker: Rocker, fetching: number | null): void {
    this.time += dt;
    this.swing += (this.swingTo - this.swing) * Math.min(1, dt * 10);
    // Left alone, the box settles level.
    if (rocker.sinceStroke > 1.5) this.swingTo *= Math.exp(-dt * 2);
    for (const d of this.drops) {
      d.vy += 420 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0);
    this.glints = this.glints.filter((glint) => (glint.life -= dt) > 0);
    this.fetchLabel.visible = fetching !== null;
    if (fetching !== null) {
      this.fetchLabel.text = 'Fetching water…';
      this.fetchLabel.position.set(this.width_ / 2, this.height_ * 0.16);
    }
    this.draw(rocker, fetching);
  }

  // ---- geometry ----

  private get center(): { x: number; y: number } {
    return { x: this.width_ * 0.5, y: this.height_ * 0.6 };
  }

  private get boxLength(): number {
    return Math.min(this.width_ * 0.5, 460);
  }

  /** A point in the box: t 0 at the hopper end to 1 at the low end; h 0 floor to 1 rim. */
  private boxPoint(t: number, h: number): { x: number; y: number } {
    const L = this.boxLength;
    const depth = 60;
    const tilt = 0.12 + this.swing; // The box always slopes a little toward the low end.
    const lx = -L / 2 + t * L;
    const ly = -h * depth;
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    return { x: this.center.x + lx * c - ly * s, y: this.center.y + lx * s + ly * c };
  }

  private overBox(x: number, y: number): boolean {
    const L = this.boxLength;
    return Math.abs(x - this.center.x) < L / 2 + 30 && y > this.center.y - 150 && y < this.center.y + 70;
  }

  private bucketRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.center.x - this.boxLength / 2 - 120, y: this.center.y - 10, w: 60, h: 64 };
  }

  // ---- drawing ----

  private draw(rocker: Rocker, fetching: number | null): void {
    const g = this.g.clear();
    const W = this.width_;
    const H = this.height_;
    const ground = this.center.y + 44;
    g.rect(0, 0, W, H).fill(COLORS.bank);
    g.rect(0, ground, W, H - ground).fill(0x4a4430);

    // Rockers: two curved runners under the box, rolling with it.
    const roll = this.swing * 60;
    for (const t of [0.22, 0.78]) {
      const x = this.center.x - this.boxLength / 2 + t * this.boxLength + roll;
      g.moveTo(x - 70, ground - 26).quadraticCurveTo(x, ground + 12, x + 70, ground - 26).stroke({ width: 7, color: COLORS.woodDark });
    }

    // The box: floor, sides, and the canvas apron and riffles on the floor.
    const corners = [this.boxPoint(0, 0), this.boxPoint(1, 0), this.boxPoint(1, 1), this.boxPoint(0, 1)];
    g.poly(corners.flatMap((p) => [p.x, p.y])).fill(COLORS.wood).stroke({ width: 3, color: COLORS.woodDark });
    const loading = rocker.apronLoading;
    const a0 = this.boxPoint(0.25, 0.02);
    const a1 = this.boxPoint(0.95, 0.02);
    const a2 = this.boxPoint(0.95, 0.12);
    const a3 = this.boxPoint(0.25, 0.12);
    g.poly([a0.x, a0.y, a1.x, a1.y, a2.x, a2.y, a3.x, a3.y]).fill(lerp(COLORS.apron, COLORS.apronFull, loading));
    for (let i = 0; i < Math.round(loading * 40); i++) {
      const p = this.boxPoint(0.26 + ((i * 0.618) % 1) * 0.68, 0.07);
      g.circle(p.x, p.y, 1.2).fill(0x0c0b0a);
    }
    for (let i = 0; i < 6; i++) {
      const p = this.boxPoint(0.35 + i * 0.11, 0);
      const q = this.boxPoint(0.35 + i * 0.11, 0.2);
      g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 4, color: COLORS.woodDark });
    }
    for (const glint of this.glints) {
      const p = this.boxPoint(glint.t, 0.08);
      const k = 6 * (glint.life / 0.45);
      g.moveTo(p.x - k, p.y).lineTo(p.x + k, p.y).moveTo(p.x, p.y - k).lineTo(p.x, p.y + k).stroke({ width: 1.5, color: COLORS.gold, alpha: glint.life / 0.45 });
    }

    // Water standing in the box, pooling toward the low end.
    const water = Math.min(1.2, rocker.water);
    if (water > 0.01) {
      const level = Math.min(0.95, water * 0.8);
      const pts: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = 0.2 + (i / 12) * 0.8;
        const p = this.boxPoint(t, Math.min(0.95, level * (0.6 + 0.6 * t)) + Math.sin(this.time * 6 + t * 10) * 0.02);
        pts.push(p.x, p.y);
      }
      for (let i = 12; i >= 0; i--) {
        const p = this.boxPoint(0.2 + (i / 12) * 0.8, 0.01);
        pts.push(p.x, p.y);
      }
      g.poly(pts).fill({ color: COLORS.water, alpha: 0.55 });
      if (water > ROCKER_TUNING.floodFrom) {
        const lip = this.boxPoint(1, 1);
        g.moveTo(lip.x, lip.y).quadraticCurveTo(lip.x + 20, lip.y + 20, lip.x + 16, ground).stroke({ width: 4, color: COLORS.foam, alpha: 0.6 });
      }
    }

    // Hopper and screen at the high end, with gravel and rocks on it.
    const h0 = this.boxPoint(-0.02, 1.05);
    const h1 = this.boxPoint(0.26, 1.05);
    const h2 = this.boxPoint(0.26, 1.7);
    const h3 = this.boxPoint(-0.02, 1.7);
    g.poly([h0.x, h0.y, h1.x, h1.y, h2.x, h2.y, h3.x, h3.y]).stroke({ width: 3, color: COLORS.woodDark });
    g.moveTo(h0.x, h0.y).lineTo(h1.x, h1.y).stroke({ width: 3, color: COLORS.screen });
    const heap = Math.min(1, rocker.hopperVolume / ROCKER_TUNING.hopperMax);
    if (heap > 0.01) {
      const top = this.boxPoint(0.12, 1.08 + heap * 0.55);
      g.poly([h0.x + 4, h0.y - 2, h1.x - 4, h1.y - 2, top.x + 18, top.y, top.x - 18, top.y + 4]).fill(COLORS.gravel);
    }
    for (let i = 0; i < Math.min(8, rocker.hopperRocks); i++) {
      const p = this.boxPoint(0.02 + ((i * 0.37) % 1) * 0.22, 1.15 + heap * 0.4 + (i % 2) * 0.12);
      g.circle(p.x, p.y, 6 + (i % 2) * 2).fill(COLORS.rock);
    }

    // The water bucket, with its level, and a ladle.
    const b = this.bucketRect();
    const fetchingNow = fetching !== null;
    g.poly([b.x, b.y, b.x + b.w, b.y, b.x + b.w - 8, b.y + b.h, b.x + 8, b.y + b.h]).fill(COLORS.bucket).stroke({ width: 2, color: COLORS.bucketDark });
    const fill = fetchingNow ? fetching : rocker.bucket / ROCKER_TUNING.bucketLadles;
    if (fill > 0) {
      const y = b.y + b.h - (b.h - 8) * fill;
      g.poly([b.x + 8 * (1 - fill) + 4, y, b.x + b.w - 8 * (1 - fill) - 4, y, b.x + b.w - 10, b.y + b.h - 3, b.x + 10, b.y + b.h - 3]).fill({ color: COLORS.water, alpha: 0.85 });
    }
    g.moveTo(b.x + b.w - 10, b.y + 10).lineTo(b.x + b.w + 16, b.y - 30).stroke({ width: 3, color: COLORS.woodDark });
    g.circle(b.x + b.w + 20, b.y - 34, 7).stroke({ width: 3, color: COLORS.woodDark });

    const fx = this.fx.clear();
    for (const d of this.drops) fx.circle(d.x, d.y, d.size).fill({ color: d.color, alpha: Math.min(1, d.life * 2) });
  }
}

function lerp(a: number, b: number, t: number): number {
  const ch = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * Math.min(1, Math.max(0, t))) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}
