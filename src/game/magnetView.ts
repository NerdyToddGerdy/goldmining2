import { Container, Graphics, Rectangle } from 'pixi.js';
import { MAGNET_TUNING, type MagnetStepEvents, type PanningSession } from '../sim';

/**
 * Close-up of the magnet over a tray of the jar's black sand. The sand is near-black while it is
 * mostly magnetite and turns reddish-grey (garnet, hematite) as the magnetite comes out. Held to
 * pass, the magnet sweeps across the tray at the chosen height; grains leap up to the sleeve and
 * build a bristling clump. A glint in the clump means gold went up with it. Stripped clumps land
 * on the discard pile to the side.
 */

const COLORS = {
  table: 0x5c3f27,
  tableDark: 0x3a2a1c,
  tray: 0x8d8f91,
  trayDark: 0x55585b,
  fresh: 0x1f1c1a,
  cleaned: 0x7a5a4e,
  magnet: 0xa8412f,
  sleeve: 0xd8dde0,
  clump: 0x141210,
  gold: 0xfff0a8,
} as const;

interface Grain {
  x: number;
  y: number;
  vy: number;
  toY: number;
}

export class MagnetView extends Container {
  private readonly g = new Graphics();
  private width_ = 800;
  private height_ = 600;
  private time = 0;
  private sweep = 0;
  private grains: Grain[] = [];
  private glints: { dx: number; dy: number; life: number }[] = [];
  /** Clumps stripped off this visit, as a pile. */
  private discarded = 0;

  constructor() {
    super();
    this.addChild(this.g);
    this.eventMode = 'static';
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
  }

  reset(): void {
    this.grains = [];
    this.glints = [];
    this.discarded = 0;
  }

  stripped(sand: number): void {
    this.discarded += sand;
  }

  update(dt: number, session: PanningSession, passing: boolean, closeness: number, events: MagnetStepEvents | null): void {
    this.time += dt;
    const tray = this.trayRect();
    if (passing) this.sweep += dt * 1.6;
    const magnet = this.magnetPos(closeness);
    const clumpSize = session.clump.sand / MAGNET_TUNING.clumpMax;

    // Grains leap from the sand up to the sleeve.
    const lifted = events?.lifted ?? 0;
    for (let i = 0; i < Math.min(20, Math.ceil(lifted / 0.0004)); i++) {
      this.grains.push({ x: magnet.x + (Math.random() - 0.5) * 60, y: tray.y + tray.h * 0.45, vy: -200 - Math.random() * 200, toY: magnet.y + 14 + clumpSize * 16 });
    }
    for (const grain of this.grains) {
      grain.y += grain.vy * dt;
      grain.x += (magnet.x - grain.x) * Math.min(1, dt * 6);
    }
    this.grains = this.grains.filter((grain) => grain.y > grain.toY).slice(-200);

    if ((events?.goldLifted ?? 0) > 0 || (session.clump.gold.length > 0 && Math.random() < dt * 0.4)) {
      this.glints.push({ dx: (Math.random() - 0.5) * 40 * Math.max(0.3, clumpSize), dy: 14 + Math.random() * 14 * clumpSize, life: 0.5 });
    }
    this.glints = this.glints.filter((glint) => (glint.life -= dt) > 0);

    this.draw(session, magnet, clumpSize);
  }

  private trayRect(): { x: number; y: number; w: number; h: number } {
    const W = this.width_;
    const H = this.height_;
    const w = Math.min(W * 0.55, 520);
    return { x: W / 2 - w / 2, y: H * 0.62, w, h: Math.min(70, H * 0.12) };
  }

  /** The magnet sweeps back and forth over the tray; closeness brings it down to the sand. */
  private magnetPos(closeness: number): { x: number; y: number } {
    const tray = this.trayRect();
    const x = tray.x + tray.w / 2 + Math.sin(this.sweep) * tray.w * 0.35;
    const low = tray.y - 34;
    const high = Math.max(this.height_ * 0.18, low - 190);
    return { x, y: high + (low - high) * Math.min(1, Math.max(0, closeness)) };
  }

  private draw(session: PanningSession, magnet: { x: number; y: number }, clumpSize: number): void {
    const g = this.g.clear();
    const W = this.width_;
    const H = this.height_;
    const tray = this.trayRect();

    g.rect(0, 0, W, H).fill(COLORS.tableDark);
    g.rect(0, H * 0.5, W, H * 0.5).fill(COLORS.table);
    for (let y = H * 0.5 + 28; y < H; y += 34) g.moveTo(0, y).lineTo(W, y).stroke({ width: 2, color: COLORS.tableDark, alpha: 0.5 });

    // Discard pile of stripped magnetite.
    const pile = Math.min(1, this.discarded / 0.6);
    if (pile > 0) {
      const px = tray.x + tray.w + 70;
      const py = tray.y + tray.h;
      g.poly([px - 20 - pile * 40, py, px + 20 + pile * 40, py, px + 8, py - 10 - pile * 40, px - 10, py - 8 - pile * 36]).fill(COLORS.clump);
    }

    // The tray and the jar's sand spread in it: darker the more magnetite is left.
    g.roundRect(tray.x, tray.y, tray.w, tray.h, 8).fill(COLORS.tray).stroke({ width: 3, color: COLORS.trayDark });
    const fill = Math.min(1, session.jar.blackSand / session.jarCapacity);
    if (fill > 0.001) {
      const cleaned = 1 - Math.min(1, session.jarMagnetiteShare / MAGNET_TUNING.share);
      const color = lerp(COLORS.fresh, COLORS.cleaned, cleaned);
      const depth = 6 + fill * (tray.h - 16);
      g.ellipse(tray.x + tray.w / 2, tray.y + tray.h - 6 - depth / 2, tray.w * (0.3 + 0.18 * fill), depth / 2 + 4).fill(color);
      for (let i = 0; i < 40; i++) {
        const x = tray.x + tray.w * (0.22 + ((i * 0.618) % 1) * 0.56);
        const y = tray.y + tray.h - 8 - ((i * 0.37) % 1) * depth;
        g.circle(x, y, 1.4).fill({ color: i % 3 === 0 ? 0x8a3f33 : 0x0c0b0a, alpha: 0.7 });
      }
    }

    // Leaping grains.
    for (const grain of this.grains) g.circle(grain.x, grain.y, 1.6).fill(COLORS.clump);

    // The magnet: a bar in a clear sleeve, with the clump bristling underneath.
    const { x, y } = magnet;
    g.moveTo(x, y - 90).lineTo(x, y - 20).stroke({ width: 6, color: 0x6b5033 });
    g.roundRect(x - 34, y - 22, 68, 30, 6).fill(COLORS.magnet).stroke({ width: 2, color: 0x5a2219 });
    g.roundRect(x - 38, y - 26, 76, 38, 8).stroke({ width: 2, color: COLORS.sleeve, alpha: 0.7 });
    if (clumpSize > 0.01) {
      const cw = 20 + clumpSize * 40;
      const ch = 6 + clumpSize * 22;
      g.ellipse(x, y + 12 + ch / 2, cw, ch / 2).fill(COLORS.clump);
      for (let i = 0; i < 14; i++) {
        const t = i / 13;
        const sx = x - cw + t * cw * 2;
        const sy = y + 12 + ch * (0.5 + 0.5 * Math.sin(t * Math.PI));
        g.moveTo(sx, sy).lineTo(sx + Math.sin(this.time * 3 + i) * 2, sy + 4 + clumpSize * 6).stroke({ width: 1.5, color: COLORS.clump });
      }
    }
    for (const glint of this.glints) {
      const k = 6 * (glint.life / 0.5);
      const gx = x + glint.dx;
      const gy = y + glint.dy;
      g.moveTo(gx - k, gy).lineTo(gx + k, gy).moveTo(gx, gy - k).lineTo(gx, gy + k).stroke({ width: 1.5, color: COLORS.gold, alpha: glint.life / 0.5 });
    }
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
