import { Container, Graphics, Rectangle } from 'pixi.js';
import { DRYWASHER_TUNING, type Drywasher, type DrywasherStepEvents } from '../sim';

/**
 * Close-up of the drywasher, side on, on a dry sandy bench: nothing wet anywhere. A screen at the
 * top with gravel and rocks on it; below it a sloped riffle tray with a cloth bottom, and under
 * that the bellows, which pump while the player holds Pump. Air puffs lift light sand off the tray
 * in brown dust clouds; heavies sit behind the riffles and the drawer at the low end fills dark.
 * The cloth greys and the puffs weaken as dust builds; the screen goes pale with clay when blinded.
 */

const COLORS = {
  sand: 0xc9b58a,
  sandDark: 0xa8946a,
  sky: 0xd9c9a3,
  frame: 0x7a5a38,
  frameDark: 0x3d2c1c,
  screen: 0x2c2a26,
  cloth: 0xb9ab86,
  dusty: 0x8a7d6a,
  bellows: 0x5e4a33,
  gravel: 0x8b8578,
  rock: 0x7c786f,
  dust: 0xb09a74,
  drawerFill: 0x1d1a14,
  gold: 0xfff0a8,
} as const;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

export class DrywasherView extends Container {
  private readonly g = new Graphics();
  private readonly fx = new Graphics();
  private width_ = 800;
  private height_ = 600;
  private time = 0;
  /** Bellows stroke, 0..1, and how fast it cycles. */
  private bellows = 0;
  private motes: Mote[] = [];
  private glints: { t: number; life: number }[] = [];

  constructor() {
    super();
    this.addChild(this.g, this.fx);
    this.eventMode = 'static';
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
  }

  reset(): void {
    this.motes = [];
    this.glints = [];
  }

  update(dt: number, dw: Drywasher, pumping: boolean, air: number, events: DrywasherStepEvents | null): void {
    this.time += dt;
    if (pumping) this.bellows = (this.bellows + dt * 2.2) % 1;
    else this.bellows *= Math.exp(-dt * 4);
    const effective = dw.effectiveAir(air);

    // Dust clouds off the tray: more with more material blown, higher with more air.
    const blown = events?.blown ?? 0;
    const count = Math.min(40, Math.round(blown / 0.0015) + (pumping ? 1 : 0));
    for (let i = 0; i < count; i++) {
      const p = this.trayPoint(0.2 + Math.random() * 0.8, 1.2);
      this.motes.push({
        x: p.x,
        y: p.y,
        vx: 20 + Math.random() * 40,
        vy: -20 - effective * 80 - Math.random() * 30,
        life: 1 + Math.random(),
        size: 4 + Math.random() * 6,
      });
    }
    for (let i = 0; i < (events?.goldLost ?? 0); i++) {
      const p = this.trayPoint(0.6 + Math.random() * 0.4, 1.4);
      this.motes.push({ x: p.x, y: p.y, vx: 30, vy: -60 - effective * 60, life: 0.8, size: -2 });
    }
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vy *= 0.97;
      m.life -= dt * 0.8;
    }
    this.motes = this.motes.filter((m) => m.life > 0).slice(-300);
    if (events?.glint) this.glints.push({ t: 0.3 + Math.random() * 0.6, life: 0.45 });
    this.glints = this.glints.filter((g) => (g.life -= dt) > 0);

    this.draw(dw, pumping, effective);
  }

  // ---- geometry ----

  private get tray(): { x0: number; y0: number; x1: number; y1: number } {
    const W = this.width_;
    const H = this.height_;
    return { x0: W * 0.3, y0: H * 0.34, x1: W * 0.78, y1: H * 0.52 };
  }

  /** A point on the tray: t along from the high end, h above the cloth (in riffle heights). */
  private trayPoint(t: number, h: number): { x: number; y: number } {
    const { x0, y0, x1, y1 } = this.tray;
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t - h * 8 };
  }

  // ---- drawing ----

  private draw(dw: Drywasher, pumping: boolean, effective: number): void {
    const g = this.g.clear();
    const W = this.width_;
    const H = this.height_;
    const ground = H * 0.72;
    g.rect(0, 0, W, H).fill(COLORS.sky);
    g.rect(0, ground, W, H - ground).fill(COLORS.sand);
    for (let i = 0; i < 50; i++) g.circle((i * 97.3) % W, ground + 6 + ((i * 41.7) % (H - ground - 8)), 2 + (i % 3)).fill(COLORS.sandDark);

    const { x0, y0, x1, y1 } = this.tray;
    // Legs and the frame.
    for (const x of [x0 + 20, x1 - 20]) g.moveTo(x, y0 + (y1 - y0) * ((x - x0) / (x1 - x0)) + 30).lineTo(x, ground).stroke({ width: 5, color: COLORS.frameDark });

    // Bellows under the tray: squeezing and opening with each pump.
    const squeeze = pumping ? 0.5 + 0.5 * Math.sin(this.bellows * Math.PI * 2) : 0.6;
    const bx = x0 + 40;
    const by = y0 + 50;
    const bh = 20 + squeeze * 26;
    g.poly([bx, by, bx + 120, by + 20, bx + 120, by + 20 + bh, bx, by + bh * 0.8]).fill(COLORS.bellows).stroke({ width: 2, color: COLORS.frameDark });
    for (let i = 1; i < 4; i++) g.moveTo(bx + i * 30, by + i * 5).lineTo(bx + i * 30, by + i * 5 + bh * 0.85).stroke({ width: 1.5, color: COLORS.frameDark });
    g.moveTo(bx + 120, by + 20 + bh / 2).lineTo(bx + 170, by + 34).stroke({ width: 5, color: COLORS.frameDark });

    // Tray: cloth bottom greying with dust, riffles across it.
    g.poly([x0, y0, x1, y1, x1, y1 + 26, x0, y0 + 26]).fill(COLORS.frame).stroke({ width: 3, color: COLORS.frameDark });
    g.poly([x0 + 6, y0 - 2, x1 - 6, y1 - 2, x1 - 6, y1 + 4, x0 + 6, y0 + 4]).fill(lerp(COLORS.cloth, COLORS.dusty, dw.dust));
    for (let i = 0; i < 9; i++) {
      const p = this.trayPoint(0.12 + i * 0.1, 0);
      g.moveTo(p.x, p.y).lineTo(p.x - 2, p.y - 10).stroke({ width: 3, color: COLORS.frameDark });
    }
    // Material riding the tray: a pale bed that dances with each puff.
    const bed = Math.min(1, dw.hopperVolume > 0.01 ? 0.5 : 0.1);
    for (let i = 0; i < 30; i++) {
      const t = (i / 30 + (pumping ? this.time * 0.15 : 0)) % 1;
      const p = this.trayPoint(t, 0.4 + (pumping ? Math.abs(Math.sin(this.time * 14 + i)) * effective * 1.5 : 0));
      g.circle(p.x, p.y, 1.8).fill({ color: i % 5 === 0 ? 0x2a2622 : 0xc8b891, alpha: bed });
    }
    for (const glint of this.glints) {
      const p = this.trayPoint(glint.t, 0.3);
      const k = 6 * (glint.life / 0.45);
      g.moveTo(p.x - k, p.y).lineTo(p.x + k, p.y).moveTo(p.x, p.y - k).lineTo(p.x, p.y + k).stroke({ width: 1.5, color: COLORS.gold, alpha: glint.life / 0.45 });
    }

    // Concentrate drawer at the low end, filling dark.
    const dx = x1 - 70;
    const dy = y1 + 30;
    g.rect(dx, dy, 70, 22).fill(COLORS.frame).stroke({ width: 2, color: COLORS.frameDark });
    const fill = dw.drawerLoading;
    if (fill > 0.01) g.rect(dx + 3, dy + 19 - 16 * fill, 64, 16 * fill).fill(COLORS.drawerFill);

    // Screen and hopper at the high end, pale with blinding clay.
    const sx = x0 - 30;
    const sy = y0 - 70;
    g.poly([sx, sy, sx + 120, sy, sx + 110, sy + 50, sx + 10, sy + 50]).stroke({ width: 3, color: COLORS.frameDark });
    g.moveTo(sx + 10, sy + 48).lineTo(sx + 110, sy + 48).stroke({ width: 4, color: lerp(COLORS.screen, 0xcbbd99, dw.screenClog) });
    const heap = Math.min(1, dw.hopperVolume / DRYWASHER_TUNING.hopperMax);
    if (heap > 0.01) g.poly([sx + 14, sy + 46, sx + 106, sy + 46, sx + 80, sy + 46 - heap * 36, sx + 36, sy + 46 - heap * 32]).fill(COLORS.gravel);
    for (let i = 0; i < Math.min(8, dw.hopperRocks); i++) g.circle(sx + 24 + ((i * 23) % 80), sy + 38 - heap * 20 - (i % 2) * 6, 6).fill(COLORS.rock);

    // Dust in the air, and fines going with it.
    const fx = this.fx.clear();
    for (const m of this.motes) {
      if (m.size < 0) fx.circle(m.x, m.y, 1.5).fill({ color: COLORS.gold, alpha: m.life });
      else fx.circle(m.x, m.y, m.size * (1.5 - m.life * 0.5)).fill({ color: COLORS.dust, alpha: Math.min(0.35, m.life * 0.25) });
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
