import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { Sluice, SluiceStepEvents } from '../sim';

/**
 * Close-up of the sluice, side on (see "Sluice UX Specification" in the design doc). The
 * machine reports its own condition: how thick and fast the water runs, eddies behind the
 * riffles when it is balanced, whitewater when overpowered, gravel heaping at the header when
 * underpowered, the moss darkening as it loads. Tap the header to rake a clog.
 */

export interface SluiceActions {
  rake(): void;
}

const COLORS = {
  bank: 0x5b5236,
  water: 0x2f5a5e,
  wood: 0x6b5033,
  woodDark: 0x3d2c1c,
  moss: 0x5f7a3c,
  mossFull: 0x1d1a14,
  sheet: 0x4f8a8c,
  foam: 0xe8f2f0,
  light: [0xc8b891, 0xb3a37e, 0xd6c9a4],
  dark: [0x24211f, 0x302b28],
  gold: 0xfff0a8,
} as const;

interface Grain {
  /** Position along the box, 0 at the header to 1 at the exit. */
  t: number;
  /** Height above the floor, as a fraction of the water depth. */
  lift: number;
  dark: boolean;
  color: number;
  /** Where a dark grain settles into the moss, if it does. */
  settleAt: number | null;
  fade: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
  size: number;
}

export class SluiceView extends Container {
  private readonly g = new Graphics();
  private readonly fx = new Graphics();
  private width_ = 800;
  private height_ = 600;
  private time = 0;
  private grains: Grain[] = [];
  private drops: Drop[] = [];
  private glints: { t: number; life: number }[] = [];
  private spawnCarry = 0;

  constructor(private readonly actions: SluiceActions) {
    super();
    this.addChild(this.g, this.fx);
    this.eventMode = 'static';
    this.on('pointertap', (e: FederatedPointerEvent) => {
      if (this.overHeader(e.global.x, e.global.y)) this.actions.rake();
    });
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
  }

  /** Call when a different sluice is shown, or after a cleanout, to clear moving grains. */
  reset(): void {
    this.grains = [];
    this.drops = [];
    this.glints = [];
  }

  update(dt: number, sluice: Sluice, events: SluiceStepEvents | null, flow: number): void {
    this.time += dt;
    const power = events?.power ?? 0;
    const state = events?.state ?? 'underpowered';

    // Material leaving the header becomes grains running down the box.
    this.spawnCarry += (events?.released ?? 0) / 0.012;
    while (this.spawnCarry >= 1) {
      this.spawnCarry -= 1;
      const dark = Math.random() < 0.12;
      this.grains.push({
        t: 0.02,
        lift: Math.random(),
        dark,
        color: pick(dark ? COLORS.dark : COLORS.light),
        settleAt: dark && Math.random() < 0.8 ? 0.2 + Math.random() * 0.7 : null,
        fade: 1,
      });
    }
    const speed = 0.08 + power * 0.9;
    for (const grain of this.grains) {
      if (grain.settleAt !== null && grain.t >= grain.settleAt) {
        grain.fade -= dt * 1.5; // Settling into the moss.
        continue;
      }
      grain.t += speed * (grain.dark ? 0.55 : 1) * dt * (0.8 + grain.lift * 0.4);
    }
    // Grains reaching the end fall off as tailings.
    for (const grain of this.grains) {
      if (grain.t >= 1) {
        const exit = this.pointAt(1);
        this.drops.push({ x: exit.x, y: exit.y - 4, vx: 40 + Math.random() * 60, vy: -10, life: 0.7, color: grain.color, size: 2 });
      }
    }
    this.grains = this.grains.filter((g) => g.t < 1 && g.fade > 0).slice(-400);

    for (let i = 0; i < (events?.goldLost ?? 0); i++) {
      const exit = this.pointAt(1);
      this.drops.push({ x: exit.x, y: exit.y - 6, vx: 50 + Math.random() * 50, vy: -20, life: 0.8, color: COLORS.gold, size: 2.5 });
    }
    if (state === 'overpowered') {
      for (let i = 0; i < 3; i++) {
        const p = this.pointAt(0.2 + Math.random() * 0.8);
        this.drops.push({ x: p.x, y: p.y - this.depth(power) - 2, vx: (Math.random() - 0.3) * 60, vy: -60 - Math.random() * 80, life: 0.35, color: COLORS.foam, size: 1.5 });
      }
    }
    if (events && events.glints > 0) this.glints.push({ t: 0.2 + Math.random() * 0.75, life: 0.4 });
    this.glints = this.glints.filter((glint) => (glint.life -= dt) > 0);
    for (const d of this.drops) {
      d.vy += 420 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0);

    this.draw(sluice, power, state, flow);
  }

  // ---- geometry ----

  private get start(): { x: number; y: number } {
    return { x: this.width_ * 0.2, y: this.height_ * 0.36 };
  }

  private get end(): { x: number; y: number } {
    return { x: this.width_ * 0.88, y: this.height_ * 0.6 };
  }

  private pointAt(t: number): { x: number; y: number } {
    const a = this.start;
    const b = this.end;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** Water depth over the riffles in pixels: a trickle to a torrent. */
  private depth(power: number): number {
    return 3 + power * 26;
  }

  private headerRect(): { x: number; y: number; w: number; h: number } {
    const s = this.start;
    return { x: s.x - 90, y: s.y - 70, w: 96, h: 74 };
  }

  private overHeader(x: number, y: number): boolean {
    const r = this.headerRect();
    return x > r.x - 10 && x < r.x + r.w + 10 && y > r.y - 20 && y < r.y + r.h + 10;
  }

  // ---- drawing ----

  private draw(sluice: Sluice, power: number, state: string, flow: number): void {
    const g = this.g.clear();
    const W = this.width_;
    const H = this.height_;
    const creekY = H * 0.68;
    g.rect(0, 0, W, H).fill(COLORS.bank);
    g.rect(0, creekY, W, H - creekY).fill(COLORS.water);
    for (let i = 0; i < 8; i++) {
      const y = creekY + 16 + i * 18;
      const drift = ((this.time * 50 + i * 71) % (W + 80)) - 40;
      g.moveTo(drift, y).lineTo(drift + 50, y);
    }
    g.stroke({ width: 2, color: 0x7fb3b0, alpha: 0.35 });

    const a = this.start;
    const b = this.end;
    const along = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(along.x, along.y);
    const up = { x: along.y / len, y: -along.x / len }; // Perpendicular, pointing up out of the box.
    const wall = 34;

    // Legs down to the creek bed.
    for (const t of [0.1, 0.55, 0.95]) {
      const p = this.pointAt(t);
      g.moveTo(p.x, p.y + 4).lineTo(p.x - 6, creekY + 30).stroke({ width: 5, color: COLORS.woodDark });
    }

    // Box: floor with side wall behind.
    g.poly([a.x, a.y, b.x, b.y, b.x + up.x * wall, b.y + up.y * wall, a.x + up.x * wall, a.y + up.y * wall]).fill(0x4a3624);
    g.poly([a.x, a.y, b.x, b.y, b.x, b.y + 8, a.x, a.y + 8]).fill(COLORS.wood);

    // Miner's moss: darkens as it loads with black sand, speckled with concentrate.
    const moss = sluice.mossLoading;
    const m0 = this.pointAt(0.16);
    const m1 = this.pointAt(0.98);
    g.poly([m0.x, m0.y - 1, m1.x, m1.y - 1, m1.x + up.x * 7, m1.y + up.y * 7, m0.x + up.x * 7, m0.y + up.y * 7]).fill(lerp(COLORS.moss, COLORS.mossFull, moss));
    for (let i = 0; i < Math.round(moss * 60); i++) {
      const p = this.pointAt(0.17 + ((i * 0.618) % 1) * 0.8);
      g.circle(p.x + up.x * 3, p.y + up.y * 3, 1.2).fill(0x0c0b0a);
    }
    for (const glint of this.glints) {
      const p = this.pointAt(glint.t);
      const k = 6 * (glint.life / 0.4);
      const cx = p.x + up.x * 4;
      const cy = p.y + up.y * 4;
      g.moveTo(cx - k, cy).lineTo(cx + k, cy).moveTo(cx, cy - k).lineTo(cx, cy + k).stroke({ width: 1.5, color: COLORS.gold, alpha: glint.life / 0.4 });
    }

    // Riffles: cleats across the floor that make eddies and hold the concentrate.
    const riffles = 10;
    for (let i = 0; i < riffles; i++) {
      const t = 0.2 + (i / (riffles - 1)) * 0.75;
      const p = this.pointAt(t);
      g.moveTo(p.x, p.y).lineTo(p.x + up.x * 14 - along.x / len * 5, p.y + up.y * 14 - along.y / len * 5).stroke({ width: 4, color: COLORS.woodDark });
    }

    // The water sheet over the riffles.
    const depth = this.depth(power);
    if (power > 0.01) {
      const pts: number[] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = this.pointAt(t);
        const wobble = state === 'overpowered' ? Math.sin(this.time * 14 + t * 30) * 3 : Math.sin(this.time * 4 + t * 12) * 1;
        pts.push(p.x + up.x * (depth + wobble), p.y + up.y * (depth + wobble));
      }
      for (let i = steps; i >= 0; i--) {
        const p = this.pointAt(i / steps);
        pts.push(p.x + up.x * 2, p.y + up.y * 2);
      }
      g.poly(pts).fill({ color: COLORS.sheet, alpha: 0.55 });
      // Streaks show speed.
      const speed = 0.1 + power * 1.2;
      for (let i = 0; i < 9; i++) {
        const t = (this.time * speed + i / 9) % 1;
        const p = this.pointAt(t);
        const h = depth * (0.3 + ((i * 0.37) % 0.6));
        g.moveTo(p.x + up.x * h, p.y + up.y * h)
          .lineTo(p.x + up.x * h + (along.x / len) * 22, p.y + up.y * h + (along.y / len) * 22)
          .stroke({ width: 1.5, color: state === 'overpowered' ? COLORS.foam : 0xa9d3d0, alpha: 0.6 });
      }
      // Balanced water curls back behind each riffle: the eddies that drop the heavies.
      if (state === 'balanced') {
        for (let i = 0; i < riffles - 1; i++) {
          const t = 0.2 + (i / (riffles - 1)) * 0.75 + 0.03;
          const p = this.pointAt(t);
          const cx = p.x + up.x * 9;
          const cy = p.y + up.y * 9;
          const phase = this.time * 5 + i;
          g.arc(cx, cy, 4, phase, phase + Math.PI * 1.3).stroke({ width: 1.2, color: 0xcfe8e4, alpha: 0.7 });
        }
      }
    }

    // Gravel riding the water down the box.
    for (const grain of this.grains) {
      const p = this.pointAt(grain.t);
      const h = grain.settleAt !== null && grain.t >= grain.settleAt ? 3 : 2 + grain.lift * Math.max(2, depth - 4);
      g.circle(p.x + up.x * h, p.y + up.y * h, grain.dark ? 1.8 : 2.4).fill({ color: grain.color, alpha: grain.fade });
    }

    // Header box with the feed heaped in it; flume bringing water in from upstream.
    const hr = this.headerRect();
    const flumeDepth = 2 + flow * 10;
    g.poly([0, hr.y - 30, hr.x + 20, hr.y + 6, hr.x + 20, hr.y + 6 + flumeDepth, 0, hr.y - 30 + flumeDepth]).fill({ color: COLORS.sheet, alpha: 0.75 });
    g.rect(hr.x, hr.y, hr.w, hr.h).fill(0x5a4128).stroke({ width: 2, color: COLORS.woodDark });
    const heap = Math.min(1, sluice.headerVolume / 2);
    if (heap > 0) {
      const top = hr.y + hr.h - 4 - heap * (hr.h - 10);
      g.poly([hr.x + 4, hr.y + hr.h - 4, hr.x + hr.w - 4, hr.y + hr.h - 4, hr.x + hr.w * 0.7, top, hr.x + hr.w * 0.3, top + 6]).fill(0x8b8578);
      for (let i = 0; i < Math.min(8, sluice.headerRocks); i++) {
        g.circle(hr.x + 16 + ((i * 23) % (hr.w - 30)), top + 8 + (i % 3) * 6, 5 + (i % 2) * 2).fill(0x7c786f);
      }
    }
    // A clog backs water up over the header walls.
    if (sluice.clog > 0.35) {
      const n = Math.round(sluice.clog * 8);
      for (let i = 0; i < n; i++) {
        this.drops.push({
          x: hr.x + Math.random() * hr.w,
          y: hr.y,
          vx: (Math.random() - 0.5) * 80,
          vy: -40 - Math.random() * 60,
          life: 0.5,
          color: COLORS.foam,
          size: 1.8,
        });
      }
    }

    const fx = this.fx.clear();
    for (const d of this.drops) fx.circle(d.x, d.y, d.size).fill({ color: d.color, alpha: Math.min(1, d.life * 2) });
  }
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function lerp(a: number, b: number, t: number): number {
  const ch = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * Math.min(1, Math.max(0, t))) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}
