import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import { HIGHBANKER_TUNING, type Highbanker, type HighbankerStepEvents } from '../sim';
import { SluiceView } from './sluiceView';

/**
 * Close-up of the highbanker. The sluice box below is drawn by the sluice view (water sheet,
 * riffles, moss, tailings); over it sit the hopper and grizzly, the spray bar washing gravel down,
 * and on the bank the engine and pump with a hose into the creek. The machine shows its state:
 * the spray and its strength, gravel heaped in the hopper, a rock jammed across the bars, the
 * engine shaking and puffing, glowing as it heats, steaming when it is too hot, bubbles at the
 * intake when the hose sucks air, and the fuel gauge.
 */

export interface HighbankerActions {
  /** Tap the header: rake the sluice's intake. */
  rake(): void;
  /** Tap the hopper: pull a jammed rock off the grizzly. */
  clearGrizzly(): void;
}

const COLORS = {
  frame: 0x6b5033,
  frameDark: 0x3d2c1c,
  grizzly: 0x55585b,
  gravel: 0x8b8578,
  rock: 0x7c786f,
  engine: 0xa8412f,
  engineCold: 0x6e3a2e,
  hot: 0xff7a3a,
  hose: 0x1e1e1e,
  spray: 0xcfe8e4,
  water: 0x4f8a8c,
} as const;

interface Puff {
  x: number;
  y: number;
  life: number;
  steam: boolean;
}

export class HighbankerView extends Container {
  private readonly sluiceView: SluiceView;
  private readonly g = new Graphics();
  private readonly note = new Text({ text: '', style: { fill: 0xefe6cf, fontSize: 16, fontFamily: 'Georgia, serif' } });
  private width_ = 800;
  private height_ = 600;
  private time = 0;
  private puffs: Puff[] = [];
  private drops: { x: number; y: number; vx: number; vy: number; life: number }[] = [];

  constructor(private readonly actions: HighbankerActions) {
    super();
    this.sluiceView = new SluiceView({ rake: () => actions.rake() });
    this.sluiceView.pumpFed = true;
    this.sluiceView.eventMode = 'none';
    this.note.anchor.set(0.5);
    this.addChild(this.sluiceView, this.g, this.note);
    this.eventMode = 'static';
    this.on('pointertap', (e: FederatedPointerEvent) => {
      const { x, y } = e.global;
      const hopper = this.hopperRect();
      if (x > hopper.x - 10 && x < hopper.x + hopper.w + 10 && y > hopper.y - 20 && y < hopper.y + hopper.h + 10) this.actions.clearGrizzly();
      else {
        const hr = this.sluiceView.headerRect();
        if (x > hr.x - 10 && x < hr.x + hr.w + 10 && y > hr.y - 10 && y < hr.y + hr.h + 10) this.actions.rake();
      }
    });
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
    this.sluiceView.layout(width, height);
  }

  reset(): void {
    this.sluiceView.reset();
    this.puffs = [];
    this.drops = [];
  }

  update(dt: number, hb: Highbanker, events: HighbankerStepEvents | null, throttle: number, priming: number | null): void {
    this.time += dt;
    this.sluiceView.update(dt, hb.sluice, events?.sluice ?? null, throttle);

    const engine = this.enginePos();
    if (hb.running && Math.random() < dt * (6 + throttle * 10)) {
      this.puffs.push({ x: engine.x + 18, y: engine.y - 30, life: 1, steam: false });
    }
    if (hb.heat > 0.7 && Math.random() < dt * 8 * hb.heat) this.puffs.push({ x: engine.x + (Math.random() - 0.5) * 30, y: engine.y - 18, life: 0.8, steam: true });
    for (const puff of this.puffs) {
      puff.y -= (puff.steam ? 40 : 28) * dt;
      puff.x += 10 * dt;
      puff.life -= dt;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);

    // The spray bar's jets over the hopper.
    const hopper = this.hopperRect();
    if (events?.spraying) {
      for (let i = 0; i < Math.round(2 + throttle * 6); i++) {
        this.drops.push({ x: hopper.x + Math.random() * hopper.w, y: hopper.y - 8, vx: (Math.random() - 0.5) * 20, vy: 60 + Math.random() * 60 * throttle, life: 0.3 });
      }
    }
    for (const d of this.drops) {
      d.vy += 300 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0);

    this.note.visible = priming !== null;
    if (priming !== null) {
      this.note.text = 'Priming the pump…';
      this.note.position.set(this.width_ / 2, this.height_ * 0.14);
    }
    this.draw(hb, throttle, priming);
  }

  private hopperRect(): { x: number; y: number; w: number; h: number } {
    const hr = this.sluiceView.headerRect();
    return { x: hr.x - 10, y: hr.y - 70, w: hr.w + 20, h: 60 };
  }

  private enginePos(): { x: number; y: number } {
    const hr = this.sluiceView.headerRect();
    return { x: Math.max(40, hr.x - 70), y: this.height_ * 0.62 };
  }

  private draw(hb: Highbanker, throttle: number, priming: number | null): void {
    const g = this.g.clear();
    const hopper = this.hopperRect();
    const hr = this.sluiceView.headerRect();
    const creekY = this.height_ * 0.68;

    // Hopper on the stand over the header, with the grizzly bars sloping down to the right.
    g.moveTo(hopper.x + 4, hopper.y + hopper.h).lineTo(hr.x + 8, hr.y).moveTo(hopper.x + hopper.w - 4, hopper.y + hopper.h).lineTo(hr.x + hr.w - 8, hr.y);
    g.stroke({ width: 4, color: COLORS.frameDark });
    g.poly([hopper.x, hopper.y, hopper.x + hopper.w, hopper.y, hopper.x + hopper.w - 8, hopper.y + hopper.h, hopper.x + 8, hopper.y + hopper.h]).fill(COLORS.frame).stroke({ width: 2, color: COLORS.frameDark });
    const fill = Math.min(1, hb.hopperVolume / HIGHBANKER_TUNING.hopperMax);
    if (fill > 0.01) {
      const top = hopper.y + hopper.h - 6 - fill * (hopper.h - 12);
      g.poly([hopper.x + 10, hopper.y + hopper.h - 4, hopper.x + hopper.w - 10, hopper.y + hopper.h - 4, hopper.x + hopper.w * 0.7, top, hopper.x + hopper.w * 0.3, top + 4]).fill(COLORS.gravel);
    }
    for (let i = 0; i < 6; i++) {
      const x = hopper.x + 10 + i * ((hopper.w - 20) / 5);
      g.moveTo(x, hopper.y + 6).lineTo(x + 8, hopper.y + hopper.h - 6).stroke({ width: 2, color: COLORS.grizzly });
    }
    for (let i = 0; i < Math.min(8, hb.hopperRocks); i++) {
      g.circle(hopper.x + 16 + ((i * 23) % (hopper.w - 30)), hopper.y + 14 + (i % 3) * 10, 5 + (i % 2) * 2).fill(COLORS.rock);
    }
    if (hb.jammed) {
      // A big rock wedged across the bars, outlined so it reads at a glance.
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 6);
      g.ellipse(hopper.x + hopper.w / 2, hopper.y + hopper.h * 0.55, 20, 13).fill(COLORS.rock).stroke({ width: 3, color: 0xe6b940, alpha: pulse });
    }
    // Spray bar across the top of the hopper.
    g.moveTo(hopper.x - 4, hopper.y - 8).lineTo(hopper.x + hopper.w + 4, hopper.y - 8).stroke({ width: 5, color: 0x5e6164 });
    for (const d of this.drops) g.circle(d.x, d.y, 1.6).fill({ color: COLORS.spray, alpha: Math.min(1, d.life * 3) });

    // Engine and pump on the bank; hose into the creek, and up to the spray bar.
    const e = this.enginePos();
    const shake = hb.running ? Math.sin(this.time * 70) * (1 + throttle) : 0;
    const body = lerp(hb.running ? COLORS.engine : COLORS.engineCold, COLORS.hot, Math.max(0, (hb.heat - 0.5) * 2));
    g.moveTo(e.x - 12, e.y + 8).quadraticCurveTo(e.x - 30, creekY, e.x - 8, creekY + 22).stroke({ width: 6, color: COLORS.hose });
    g.moveTo(e.x + 22, e.y - 10).quadraticCurveTo(e.x + 30, hopper.y - 40, hopper.x - 4, hopper.y - 8).stroke({ width: 6, color: COLORS.hose });
    g.roundRect(e.x - 22 + shake, e.y - 24, 48, 32, 4).fill(body).stroke({ width: 2, color: 0x2a1a14 });
    g.rect(e.x + 14 + shake, e.y - 34, 6, 11).fill(0x3a3a3a);
    // Air at the intake: the hose is sucking air and the pump has lost its prime.
    if (hb.running && !hb.primed) {
      for (let i = 0; i < 4; i++) g.circle(e.x - 8 + (Math.random() - 0.5) * 16, creekY + 18 - Math.random() * 14, 2 + Math.random() * 2).stroke({ width: 1.5, color: COLORS.spray });
    }
    // Fuel gauge.
    const fuel = hb.fuel / HIGHBANKER_TUNING.tank;
    g.rect(e.x - 22, e.y + 14, 48, 6).fill(0x2a2a2a);
    g.rect(e.x - 22, e.y + 14, 48 * fuel, 6).fill(fuel < 0.15 ? 0xd05a3a : 0xd8c070);
    if (priming !== null) {
      g.rect(e.x - 22, e.y + 24, 48, 4).fill(0x2a2a2a);
      g.rect(e.x - 22, e.y + 24, 48 * priming, 4).fill(COLORS.water);
    }

    for (const p of this.puffs) {
      g.circle(p.x, p.y, (p.steam ? 6 : 4) + (1 - p.life) * 8).fill({ color: p.steam ? 0xf0f0f0 : 0x6a6660, alpha: p.life * (p.steam ? 0.5 : 0.4) });
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
