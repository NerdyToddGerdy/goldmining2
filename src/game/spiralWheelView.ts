import { Container, Graphics } from 'pixi.js';
import { SPIRAL_TUNING, type SpiralStepEvents, type SpiralWheel } from '../sim';

/**
 * The spiral wheel on its stand. What the player reads, before any numbers: the wheel's tilt and
 * its spiral grooves turning; the spray bar's jets, harder or softer; the feed tray dribbling black
 * sand onto the wheel's low edge; sand climbing outward along the grooves and spilling off the rim
 * into the tailings bucket; specks of gold riding the other way to the centre hole and dropping
 * into the cup behind it. Crowded, sand heaps at the centre and the cup darkens; overdriven, glints
 * go over the rim with the sand.
 */

const COLORS = {
  ground: 0x3b3326,
  groundTown: 0x3a2a1c,
  stand: 0x5d4630,
  standDark: 0x3a2b1d,
  wheel: 0x2e5b3a,
  wheelRim: 0x3f7a4e,
  groove: 0x224330,
  sand: 0x26221f,
  sandLight: 0x3a3430,
  gold: 0xe6b940,
  goldBright: 0xfff0a8,
  spray: 0xcfe8e4,
  bar: 0x6a6e70,
  bucket: 0x7c8384,
  bucketDark: 0x5d6364,
  tray: 0x8a6a48,
} as const;

interface Speck {
  /** 1 at the rim, 0 at the centre. */
  r: number;
  a: number;
  gold: boolean;
  life: number;
}

export class SpiralWheelView extends Container {
  private readonly g = new Graphics();
  private width_ = 800;
  private height_ = 600;
  private time = 0;
  private turn = 0;
  private specks: Speck[] = [];
  private spills: { x: number; y: number; vx: number; vy: number; life: number; gold: boolean }[] = [];
  private dribble: { x: number; y: number; vy: number; life: number }[] = [];
  /** In town the wheel stands on the back-room floor; at a creek, on the bank. */
  inTown = false;

  constructor() {
    super();
    this.addChild(this.g);
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
  }

  reset(): void {
    this.specks = [];
    this.spills = [];
    this.dribble = [];
  }

  private get centre(): { x: number; y: number; R: number } {
    const R = Math.min(this.width_ * 0.2, this.height_ * 0.28, 210);
    return { x: this.width_ * 0.52, y: this.height_ * 0.47, R };
  }

  update(dt: number, wheel: SpiralWheel, events: SpiralStepEvents | null, tilt: number, spray: number, jarFill: number): void {
    this.time += dt;
    const running = wheel.leveled && events !== null;
    if (running) this.turn += dt * 1.6;
    const { x, y, R } = this.centre;
    const ry = R * (0.62 - tilt * 0.22);

    // Sand fed on arrives at the low edge and climbs out; gold arrives with it and rides in.
    if (running && events) {
      for (let i = 0; i < Math.min(4, Math.ceil(events.fed * 900)); i++) this.specks.push({ r: 0.55, a: Math.PI * (0.85 + Math.random() * 0.2), gold: false, life: 1 });
      for (let i = 0; i < events.toCup; i++) this.specks.push({ r: 0.35, a: Math.random() * Math.PI * 2, gold: true, life: 1 });
      for (let i = 0; i < Math.min(3, Math.ceil(events.spilled * 600)); i++) {
        const a = -0.4 + Math.random() * 0.8;
        this.spills.push({ x: x + Math.cos(a) * R, y: y + Math.sin(a) * ry, vx: 30 + Math.random() * 30, vy: 10, life: 0.8, gold: false });
      }
      for (let i = 0; i < events.overRim; i++) this.spills.push({ x: x + R, y, vx: 50, vy: 0, life: 0.9, gold: true });
      if (events.fed > 0) this.dribble.push({ x: x - R * 1.05 + Math.random() * 10, y: y + ry * 0.2, vy: 40, life: 0.35 });
    }
    // Sand climbs outward along the grooves; gold rides inward to the centre.
    const crowd = Math.min(1, wheel.wheel.sand / SPIRAL_TUNING.crowdAt);
    for (const s of this.specks) {
      s.a += dt * 1.6;
      s.r += dt * (s.gold ? -0.5 : 0.35 * (1.2 - crowd));
      s.life -= dt * 0.6;
    }
    this.specks = this.specks.filter((s) => s.life > 0 && s.r > 0.05 && s.r < 1);
    if (this.specks.length > 160) this.specks.splice(0, this.specks.length - 160);
    for (const p of this.spills) {
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.spills = this.spills.filter((p) => p.life > 0);
    for (const d of this.dribble) {
      d.y += d.vy * dt;
      d.life -= dt;
    }
    this.dribble = this.dribble.filter((d) => d.life > 0);
    this.draw(wheel, events, tilt, spray, jarFill);
  }

  private draw(wheel: SpiralWheel, events: SpiralStepEvents | null, tilt: number, spray: number, jarFill: number): void {
    const g = this.g.clear();
    const W = this.width_;
    const H = this.height_;
    const { x, y, R } = this.centre;
    const ry = R * (0.62 - tilt * 0.22);

    g.rect(0, 0, W, H).fill(this.inTown ? COLORS.groundTown : COLORS.ground);
    if (this.inTown) for (let px = 0; px < W; px += 46) g.moveTo(px, 0).lineTo(px, H).stroke({ width: 2, color: 0x2e2116 });
    else for (let i = 0; i < 50; i++) g.circle((i * 97.3) % W, (i * 53.1) % H, 2 + (i % 4)).fill(0x4a4030);

    // The stand, raked back by the tilt.
    g.moveTo(x - R * 0.6, y + ry).lineTo(x - R * 0.7, y + ry + R * 0.6).moveTo(x + R * 0.6, y + ry).lineTo(x + R * 0.7, y + ry + R * 0.6).stroke({ width: 6, color: COLORS.standDark });

    // The cup behind the centre hole.
    const cupFill = Math.min(1, wheel.cup.sand / (SPIRAL_TUNING.cupDirty * 2));
    const cx = x;
    const cy = y + ry + R * 0.28;
    g.roundRect(cx - 18, cy - 16, 36, 30, 5).fill(0xb9bdb8).stroke({ width: 2, color: 0x6a6e70 });
    if (cupFill > 0.02) g.rect(cx - 15, cy + 11 - 22 * cupFill, 30, 22 * cupFill).fill(COLORS.sand);
    wheel.cup.gold.slice(0, 12).forEach((_, i) => g.circle(cx - 11 + ((i * 7) % 22), cy + 6 - Math.floor(i / 4) * 4, 1.8).fill(COLORS.goldBright));
    g.moveTo(cx, y).lineTo(cx, cy - 16).stroke({ width: 4, color: 0x6a6e70 });

    // The wheel, its spiral grooves turning.
    g.ellipse(x, y, R, ry).fill(COLORS.wheel).stroke({ width: 6, color: COLORS.wheelRim });
    for (let arm = 0; arm < 3; arm++) {
      const pts: number[] = [];
      for (let k = 0; k <= 60; k++) {
        const t = k / 60;
        const a = this.turn + arm * ((Math.PI * 2) / 3) + t * Math.PI * 4;
        const r = 0.08 + t * 0.9;
        pts.push(x + Math.cos(a) * r * R, y + Math.sin(a) * r * ry);
      }
      g.poly(pts, false).stroke({ width: 2.5, color: COLORS.groove });
    }
    g.circle(x, y, R * 0.07).fill(0x111111);

    // Sand crowding the centre, and the specks riding the grooves.
    const crowd = Math.min(1.5, wheel.wheel.sand / SPIRAL_TUNING.crowdAt);
    if (crowd > 1) g.ellipse(x, y, R * 0.18 * (crowd - 0.5), ry * 0.18 * (crowd - 0.5)).fill({ color: COLORS.sand, alpha: 0.8 });
    for (const s of this.specks) {
      const px = x + Math.cos(s.a) * s.r * R;
      const py = y + Math.sin(s.a) * s.r * ry;
      if (s.gold) g.circle(px, py, 2).fill(COLORS.goldBright);
      else g.circle(px, py, 2.4).fill(s.r > 0.8 ? COLORS.sandLight : COLORS.sand);
    }

    // Spray bar across the upper half, jets by strength.
    const barY = y - ry * 0.55;
    g.moveTo(x - R * 0.85, barY - 30).lineTo(x + R * 0.85, barY - 30).stroke({ width: 5, color: COLORS.bar });
    if (wheel.leveled && events) {
      for (let i = 0; i < Math.round(4 + spray * 10); i++) {
        const jx = x - R * 0.75 + ((i * 37 + this.time * 90) % (R * 1.5));
        g.moveTo(jx, barY - 28).lineTo(jx + (Math.random() - 0.5) * 6, barY - 28 + 10 + spray * 26).stroke({ width: 1.3, color: COLORS.spray, alpha: 0.4 + spray * 0.5 });
      }
    }

    // The feed tray at the low edge, and the jar beside it.
    const tx = x - R * 1.25;
    const ty = y + ry * 0.05;
    const tray = Math.min(1, wheel.tray.sand / SPIRAL_TUNING.trayMax);
    g.poly([tx - 40, ty - 18, tx + 36, ty - 8, tx + 30, ty + 10, tx - 40, ty + 6]).fill(COLORS.tray).stroke({ width: 2, color: COLORS.standDark });
    if (tray > 0.01) g.poly([tx - 36, ty + 3 - 16 * tray, tx + 26, ty + 6 - 10 * tray, tx + 26, ty + 6, tx - 36, ty + 3]).fill(COLORS.sand);
    for (const d of this.dribble) g.circle(d.x + R * 0.2, d.y, 2).fill(COLORS.sand);
    const jx = tx - 20;
    const jy = ty + 40;
    g.roundRect(jx - 20, jy, 40, 54, 6).fill({ color: 0xdfe8e6, alpha: 0.12 }).stroke({ width: 2, color: 0xdfe8e6, alpha: 0.45 });
    if (jarFill > 0.01) g.roundRect(jx - 17, jy + 51 - 48 * jarFill, 34, 48 * jarFill, 4).fill(COLORS.sand);

    // Sand spilling off the rim into the tailings bucket; a glint when gold goes with it.
    for (const p of this.spills) g.circle(p.x, p.y, p.gold ? 2.5 : 2).fill(p.gold ? COLORS.goldBright : COLORS.sand);
    const bx = x + R * 1.3;
    const by = y + ry * 0.4;
    const fill = Math.min(1, wheel.tailings.sand / SPIRAL_TUNING.bucketMax);
    g.poly([bx - 34, by, bx + 34, by, bx + 28, by + 62, bx - 28, by + 62]).fill(COLORS.bucket).stroke({ width: 2, color: COLORS.bucketDark });
    if (fill > 0.01) g.poly([bx - 30 + 4 * (1 - fill), by + 60 - 56 * fill, bx + 30 - 4 * (1 - fill), by + 60 - 56 * fill, bx + 26, by + 60, bx - 26, by + 60]).fill(COLORS.sand);
    if (wheel.bucketFull) g.poly([bx - 34, by, bx + 34, by, bx + 28, by + 62, bx - 28, by + 62]).stroke({ width: 3, color: 0xe6b940, alpha: 0.5 + 0.5 * Math.sin(this.time * 6) });

    // Not yet level: a spirit level on the rim, its bubble off centre.
    if (!wheel.leveled) {
      g.roundRect(x - 40, y - ry - 26, 80, 14, 7).fill(0xd8d0a0).stroke({ width: 2, color: 0x6a5a30 });
      g.circle(x - 20 + Math.sin(this.time * 2) * 6, y - ry - 19, 5).fill(0x9fd08a);
    }
  }
}
