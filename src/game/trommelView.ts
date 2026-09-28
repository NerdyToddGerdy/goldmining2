import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { TROMMEL_TUNING, type Trommel, type TrommelStepEvents } from '../sim';
import { SluiceView } from './sluiceView';

/**
 * Close-up of the trommel. The recovery deck below is drawn by the sluice view (water, riffles,
 * moss, tailings); over it the drum turns on its frame, hopper at the top end, spray bar through
 * it. What the player reads, before any numbers: the drum's bands going round (crawling, tumbling,
 * or racing), the load cascading inside it (or riding up the wall when it races), fines raining
 * through the screen onto the deck, rocks and clay balls rolling out the end onto a growing pile,
 * and a jammed drum standing still, outlined, until it's barred loose.
 */

export interface TrommelActions {
  /** Tap the drum: bar a jam loose. */
  clearJam(): void;
  /** Tap the deck's header: rake it clear. */
  rake(): void;
}

const COLORS = {
  frame: 0x6b5033,
  frameDark: 0x3d2c1c,
  drum: 0x6f7477,
  drumDark: 0x45494c,
  band: 0x9aa0a3,
  gravel: 0x8b8578,
  clay: 0x8a6a48,
  rock: 0x7c786f,
  fines: 0x3d3a34,
  spray: 0xcfe8e4,
  engine: 0xa8412f,
  engineCold: 0x6e3a2e,
  jam: 0xe6b940,
} as const;

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: number;
}

export class TrommelView extends Container {
  private readonly deckView: SluiceView;
  private readonly g = new Graphics();
  private width_ = 800;
  private height_ = 600;
  private time = 0;
  /** The drum's turn, for its bands and the load inside. */
  private turn = 0;
  private bits: Bit[] = [];
  private puffs: { x: number; y: number; life: number }[] = [];
  private clearOf: { readonly right: number; readonly bottom: number } | null = null;

  constructor(private readonly actions: TrommelActions) {
    super();
    this.deckView = new SluiceView({ rake: () => actions.rake() });
    this.deckView.pumpFed = true;
    // The drum stands about 90px over the deck's header: keep it clear of the readouts too.
    this.deckView.topClearance = 90;
    // ...and its hopper hangs about 50px left of the header.
    this.deckView.leftClearance = 50;
    this.deckView.eventMode = 'none';
    this.addChild(this.deckView, this.g);
    this.eventMode = 'static';
    this.on('pointertap', (e: FederatedPointerEvent) => {
      const { x, y } = e.global;
      const d = this.drumRect();
      if (x > d.x - 10 && x < d.x + d.w + 10 && y > d.y - 20 && y < d.y + d.h + 10) this.actions.clearJam();
      else {
        const hr = this.deckView.headerRect();
        if (x > hr.x - 10 && x < hr.x + hr.w + 10 && y > hr.y - 10 && y < hr.y + hr.h + 10) this.actions.rake();
      }
    });
  }

  set keepOut(bounds: { readonly right: number; readonly bottom: number } | null) {
    this.deckView.keepOut = bounds;
    this.clearOf = bounds;
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
    this.deckView.layout(width, height);
  }

  reset(): void {
    this.deckView.reset();
    this.bits = [];
    this.puffs = [];
  }

  update(dt: number, t: Trommel, events: TrommelStepEvents | null, speed: number, spray: number): void {
    this.time += dt;
    this.deckView.update(dt, t.deck, events?.deck ?? null, spray);
    const turning = events !== null && events.drum !== 'stopped' && events.drum !== 'jammed';
    if (turning) this.turn += dt * (0.5 + speed * 5);
    const d = this.drumRect();

    // Fines raining through the screen onto the deck, rocks and clay balls out the end.
    if (turning && events) {
      for (let i = 0; i < Math.min(6, Math.ceil(events.screened * 80)); i++) {
        this.bits.push({ x: d.x + 20 + Math.random() * (d.w - 50), y: d.y + d.h, vx: 0, vy: 30 + Math.random() * 30, life: 0.5, size: 1.4, color: COLORS.fines });
      }
      for (let i = 0; i < Math.min(3, Math.round(events.oversize)); i++) {
        const clay = Math.random() < t.drumClay * 3;
        this.bits.push({ x: d.x + d.w, y: d.y + d.h * 0.6, vx: 30 + speed * 60, vy: -20, life: 0.9, size: clay ? 5 : 6, color: clay ? COLORS.clay : COLORS.rock });
      }
    }
    for (const b of this.bits) {
      b.vy += 380 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);

    const e = this.enginePos();
    if (t.running && Math.random() < dt * (6 + speed * 8)) this.puffs.push({ x: e.x + 18, y: e.y - 30, life: 1 });
    for (const p of this.puffs) {
      p.y -= 28 * dt;
      p.x += 10 * dt;
      p.life -= dt;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    this.draw(t, events, speed, spray);
  }

  /** The drum, over the deck from its header down toward the middle of the box. */
  private drumRect(): { x: number; y: number; w: number; h: number } {
    const hr = this.deckView.headerRect();
    const w = Math.min(this.width_ * 0.42, 420);
    // On a short screen there's no room above the header: the drum comes down over it, below the hint.
    const short = this.height_ < 500;
    const h = short ? 44 : 58;
    return { x: hr.x - 10, y: Math.max(short ? 52 : 70, hr.y - 90), w, h };
  }

  private enginePos(): { x: number; y: number } {
    const hr = this.deckView.headerRect();
    const pos = { x: Math.max(40, hr.x - 70), y: this.height_ * 0.62 };
    if (this.clearOf && pos.x - 30 < this.clearOf.right && pos.y - 30 < this.clearOf.bottom) pos.x = hr.x + hr.w + 40;
    return pos;
  }

  private draw(t: Trommel, events: TrommelStepEvents | null, speed: number, spray: number): void {
    const g = this.g.clear();
    const d = this.drumRect();
    const state = events?.drum ?? 'stopped';

    // Frame legs down to the deck, and the oversize pile growing past the drum's far end.
    g.moveTo(d.x + 12, d.y + d.h).lineTo(d.x + 18, d.y + d.h + 60).moveTo(d.x + d.w - 12, d.y + d.h).lineTo(d.x + d.w - 6, d.y + d.h + 60);
    g.stroke({ width: 4, color: COLORS.frameDark });
    const pile = Math.min(60, 8 + Math.sqrt(t.pile) * 4);
    g.ellipse(d.x + d.w + 36, d.y + d.h + 64, pile, pile * 0.45).fill(COLORS.rock);
    for (let i = 0; i < Math.min(10, Math.floor(t.pile / 3)); i++) g.circle(d.x + d.w + 36 - pile * 0.6 + ((i * 17) % (pile * 1.2)), d.y + d.h + 60 - (i % 3) * 4, 3).fill(0x6d685c);

    // Hopper at the top end.
    const hx = d.x - 36;
    g.poly([hx, d.y - 26, hx + 50, d.y - 26, hx + 40, d.y + 18, hx + 10, d.y + 18]).fill(COLORS.frame).stroke({ width: 2, color: COLORS.frameDark });
    const fill = Math.min(1, t.hopperVolume / TROMMEL_TUNING.hopperMax);
    if (fill > 0.01) g.poly([hx + 10, d.y + 14, hx + 40, d.y + 14, hx + 44, d.y + 14 - fill * 34, hx + 6, d.y + 14 - fill * 34]).fill(COLORS.gravel);

    // The drum: a screen barrel, its bands sweeping round with the turn.
    g.roundRect(d.x, d.y, d.w, d.h, 14).fill(COLORS.drumDark);
    const bands = 9;
    for (let i = 0; i < bands; i++) {
      const phase = ((i / bands + this.turn * 0.15) % 1 + 1) % 1;
      const x = d.x + 8 + phase * (d.w - 16);
      g.moveTo(x, d.y + 3).lineTo(x - 6, d.y + d.h - 3).stroke({ width: 2, color: COLORS.band, alpha: 0.8 });
    }
    // The load inside: cascading low when tumbling, riding up the wall when racing, lying still when stopped.
    const load = Math.min(1, t.drumVolume / TROMMEL_TUNING.drumMax);
    const count = Math.round(load * 40);
    for (let i = 0; i < count; i++) {
      const along = (i * 0.618) % 1;
      const ride = state === 'racing' ? 0.85 : state === 'tumbling' ? 0.35 : 0.1;
      const a = Math.sin(this.turn * 3 + i) * ride;
      const x = d.x + 14 + along * (d.w - 28);
      const y = d.y + d.h - 10 - Math.abs(a) * (d.h - 20) - (i % 3) * 3;
      g.circle(x, y, 3 + (i % 3)).fill(i % 7 === 0 && t.drumClay > 0.05 ? COLORS.clay : COLORS.gravel);
    }
    g.roundRect(d.x, d.y, d.w, d.h, 14).stroke({ width: 3, color: COLORS.drum });
    if (state === 'jammed') {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      g.roundRect(d.x - 3, d.y - 3, d.w + 6, d.h + 6, 16).stroke({ width: 3, color: COLORS.jam, alpha: pulse });
    }
    // Spray bar through the drum's axis, jets showing when water runs.
    g.moveTo(d.x - 12, d.y + d.h / 2).lineTo(d.x + d.w + 10, d.y + d.h / 2).stroke({ width: 3, color: 0x5e6164 });
    if (t.running && spray > 0.05) {
      for (let i = 0; i < Math.round(3 + spray * 6); i++) {
        const x = d.x + 20 + Math.random() * (d.w - 40);
        g.moveTo(x, d.y + d.h / 2).lineTo(x + (Math.random() - 0.5) * 6, d.y + d.h / 2 + 8 + spray * 10).stroke({ width: 1.2, color: COLORS.spray, alpha: 0.8 });
      }
    }
    for (const b of this.bits) g.circle(b.x, b.y, b.size).fill({ color: b.color, alpha: Math.min(1, b.life * 2) });

    // Engine on its skid with a belt up to the drum, and the fuel gauge.
    const e = this.enginePos();
    const shake = t.running ? Math.sin(this.time * 70) * (1 + speed) : 0;
    g.moveTo(e.x + 20, e.y - 14).lineTo(d.x + 8, d.y + d.h - 6).stroke({ width: 3, color: 0x1e1e1e });
    g.roundRect(e.x - 22 + shake, e.y - 24, 48, 32, 4).fill(t.running ? COLORS.engine : COLORS.engineCold).stroke({ width: 2, color: 0x2a1a14 });
    g.rect(e.x + 14 + shake, e.y - 34, 6, 11).fill(0x3a3a3a);
    const fuel = t.fuel / TROMMEL_TUNING.tank;
    g.rect(e.x - 22, e.y + 14, 48, 6).fill(0x2a2a2a);
    g.rect(e.x - 22, e.y + 14, 48 * fuel, 6).fill(fuel < 0.15 ? 0xd05a3a : 0xd8c070);
    for (const p of this.puffs) g.circle(p.x, p.y, 4 + (1 - p.life) * 8).fill({ color: 0x6a6660, alpha: p.life * 0.4 });
  }
}
