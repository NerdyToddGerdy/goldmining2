import { Container, Graphics } from 'pixi.js';

/**
 * Where the player pans: the gravel bank and the moving creek, or in town the wash trough in the
 * assay office's back room (plank wall above, still water in a galvanized trough).
 *
 * The creek reads as a place: a ragged waterline with wet gravel and cobbles along it, water that
 * deepens away from the bank with stones showing through the shallows, and a current carrying
 * streaks and foam past, breaking in a riffle over a stone.
 */
export type PanSetting = 'creek' | 'town';

const CREEK = {
  bankDry: 0x6a5f40,
  bankMid: 0x5b5236,
  bankWet: 0x3e3826,
  cobble: [0x7d786c, 0x8d8573, 0x6a655a, 0x9a8e74],
  shallow: 0x3f6f6c,
  deep: 0x264b50,
  mud: 0x6b5a3a,
  streak: 0x8fc2bd,
  foam: 0xe4efe9,
} as const;

export class CreekScene extends Container {
  private readonly bank = new Graphics();
  private readonly water = new Graphics();
  /** The waterline over the water's top edge: wet gravel, cobbles, stones under the shallows. */
  private readonly edge = new Graphics();
  private readonly ripples = new Graphics();
  private viewWidth = 0;
  private viewHeight = 0;
  private time = 0;
  private murk = 0;
  private setting: PanSetting = 'creek';

  constructor() {
    super();
    this.addChild(this.bank, this.water, this.edge, this.ripples);
  }

  /** Top of the water, in screen pixels. */
  get waterTop(): number {
    return this.viewHeight * 0.22;
  }

  setSetting(setting: PanSetting): void {
    if (setting === this.setting) return;
    this.setting = setting;
    this.resize(this.viewWidth, this.viewHeight);
  }

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    const top = this.waterTop;
    this.edge.clear();
    if (this.setting === 'town') {
      // Plank wall, a shelf with the buyer's jars, and the trough's rolled galvanized rim.
      this.bank.clear().rect(0, 0, width, top).fill(0x4a3624);
      for (let x = 0; x < width; x += 46) this.bank.moveTo(x, 0).lineTo(x, top).stroke({ width: 2, color: 0x3a2a1c });
      const shelf = top * 0.42;
      this.bank.rect(width * 0.3, shelf, width * 0.3, 6).fill(0x6b4a2c);
      for (let i = 0; i < 5; i++) {
        const x = width * 0.32 + i * Math.min(46, width * 0.055);
        this.bank.roundRect(x, shelf - 22 - (i % 2) * 6, 22, 22 + (i % 2) * 6, 4).fill({ color: 0xcfd9c8, alpha: 0.22 });
      }
      this.water.clear().rect(0, top, width, height - top).fill(0x3a5559);
      // Galvanized sides and rim, riveted: the pan is dipped in a trough, not a creek.
      const side = Math.max(14, width * 0.025);
      this.water.rect(0, top, side, height - top).fill(0x7c8384).rect(width - side, top, side, height - top).fill(0x7c8384);
      this.water.rect(0, top - 6, width, 12).fill(0x9aa1a2).rect(0, top + 4, width, 3).fill(0x5d6364);
      for (let x = side * 2; x < width - side; x += 90) this.water.circle(x, top, 2).fill(0x5d6364);
      return;
    }

    // The bank: drier and paler up the slope, darker toward the water, scattered with gravel.
    const b = this.bank.clear();
    b.rect(0, 0, width, top).fill(CREEK.bankMid);
    b.rect(0, 0, width, top * 0.35).fill({ color: CREEK.bankDry, alpha: 0.7 });
    for (let i = 0; i < 70; i++) {
      const x = (i * 97.3) % width;
      const y = ((i * 53.1) % top) * 0.92;
      b.circle(x, y, 1.5 + (i % 5) * 1.6).fill(i % 3 ? 0x6e6446 : 0x4c4430);
    }
    // A few tufts of grass up the bank.
    for (let i = 0; i < 9; i++) {
      const x = ((i * 173.9 + 40) % (width - 40)) + 20;
      const y = ((i * 31.7) % (top * 0.4)) + 8;
      for (let k = -2; k <= 2; k++) b.moveTo(x + k * 2, y).lineTo(x + k * 4, y - 9 - (k % 2) * 3);
    }
    b.stroke({ width: 1.5, color: 0x6f7a3e, alpha: 0.8 });

    this.drawWater();

    // The waterline: ragged, with a dark band of wet gravel above it and cobbles along it.
    const e = this.edge;
    const line: number[] = [];
    for (let x = 0; x <= width + 20; x += 20) line.push(x, shoreY(x, top));
    e.poly([0, top - 30, ...line, width, top - 30]).fill(CREEK.bankMid);
    e.poly([0, top - 18, ...line, width, top - 18]).fill({ color: CREEK.bankWet, alpha: 0.55 });
    for (let i = 0; i < Math.ceil(width / 38); i++) {
      const x = i * 38 + ((i * 17) % 23);
      const r = 5 + ((i * 7) % 9);
      const y = shoreY(x, top) - r * 0.4 + ((i * 5) % 7) - 3;
      e.ellipse(x, y, r * 1.3, r * 0.8).fill(CREEK.cobble[i % CREEK.cobble.length]!);
      e.ellipse(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.25).fill({ color: 0xffffff, alpha: 0.12 });
    }
    // Stones showing through the shallows just off the bank.
    for (let i = 0; i < Math.ceil(width / 90); i++) {
      const x = i * 90 + ((i * 41) % 60);
      const y = shoreY(x, top) + 18 + ((i * 13) % 26);
      e.ellipse(x, y, 10 + (i % 3) * 4, 5 + (i % 2) * 2).fill({ color: 0x1f3a3c, alpha: 0.45 });
    }
    // A stone breaking the surface out in the current, for the riffle to break on.
    const stone = this.riffleStone();
    e.ellipse(stone.x, stone.y, stone.r * 1.4, stone.r * 0.7).fill(0x5d5a52);
    e.ellipse(stone.x - stone.r * 0.35, stone.y - stone.r * 0.25, stone.r * 0.7, stone.r * 0.25).fill({ color: 0xffffff, alpha: 0.15 });
  }

  /**
   * How muddy the water is (a wash tub on dry ground clouds with every pan): the water browns and
   * the ripples fade. 0 is a clear creek.
   */
  setMurk(murk: number): void {
    if (this.setting === 'town') return; // The trough's water is changed between pans.
    if (Math.abs(murk - this.murk) < 0.01) return;
    this.murk = murk;
    this.drawWater();
  }

  /** Shallow near the bank, deepening toward the viewer; browned by murk. */
  private drawWater(): void {
    const top = this.waterTop;
    const t = Math.min(1, Math.max(0, this.murk));
    const w = this.water.clear();
    const bands = 8;
    const span = this.viewHeight - top + 30;
    for (let i = 0; i < bands; i++) {
      const color = lerp(lerp(CREEK.shallow, CREEK.deep, i / (bands - 1)), CREEK.mud, t);
      w.rect(0, top - 30 + (span * i) / bands, this.viewWidth, span / bands + 1).fill(color);
    }
  }

  private riffleStone(): { x: number; y: number; r: number } {
    const h = this.viewHeight - this.waterTop;
    return { x: this.viewWidth * 0.1, y: this.waterTop + h * 0.5, r: Math.max(9, Math.min(16, this.viewWidth * 0.013)) };
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const top = this.waterTop;
    const r = this.ripples.clear();
    if (this.setting === 'town') {
      // Still water: a few glints that shimmer in place instead of a current carrying them past.
      for (let i = 0; i < 10; i++) {
        const x = ((i * 211.7) % (this.viewWidth * 0.8)) + this.viewWidth * 0.1;
        const y = top + ((i * 0.37) % 1) * (this.viewHeight - top) * 0.9 + 10;
        const w = 30 + 12 * Math.sin(this.time * 1.3 + i);
        r.moveTo(x - w / 2, y).lineTo(x + w / 2, y);
      }
      r.stroke({ width: 2, color: 0x9fbfbf, alpha: 0.22 });
      return;
    }
    const clear = 1 - 0.8 * Math.max(0, this.murk);
    const h = this.viewHeight - top;
    // Current streaks: slow by the bank, quicker out in the stream, each a gentle wave.
    for (let i = 0; i < 18; i++) {
      const depth = (i + 0.5) / 18;
      const y = top + 14 + depth * (h - 14);
      const speed = 35 + depth * 55 + (i % 3) * 8;
      const len = 60 + (i % 4) * 28;
      const x0 = ((this.time * speed + i * 137) % (this.viewWidth + len + 100)) - len - 50;
      r.moveTo(x0, y);
      for (let k = 1; k <= 4; k++) r.lineTo(x0 + (len * k) / 4, y + Math.sin(this.time * 2 + i + k) * 2.5);
    }
    r.stroke({ width: 2, color: CREEK.streak, alpha: 0.3 * clear });
    // Foam flecks riding the current.
    for (let i = 0; i < 26; i++) {
      const depth = ((i * 0.618) % 1) * 0.9 + 0.05;
      const y = top + depth * h + Math.sin(this.time * 1.5 + i) * 3;
      const x = ((this.time * (40 + depth * 60) + i * 211) % (this.viewWidth + 40)) - 20;
      r.circle(x, y, 1.2 + (i % 3) * 0.6).fill({ color: CREEK.foam, alpha: 0.4 * clear });
    }
    // The riffle over the stone: white water on its upstream face, a V trailing downstream.
    const s = this.riffleStone();
    for (let k = 0; k < 3; k++) {
      const off = ((this.time * 30 + k * 12) % 36);
      r.moveTo(s.x + s.r + off, s.y - 2 - off * 0.35).lineTo(s.x + s.r + off + 14, s.y - 3 - off * 0.45);
      r.moveTo(s.x + s.r + off, s.y + 2 + off * 0.35).lineTo(s.x + s.r + off + 14, s.y + 3 + off * 0.45);
    }
    r.stroke({ width: 2, color: CREEK.foam, alpha: 0.35 * clear });
    // White water piling on its upstream face.
    for (let k = 0; k < 5; k++) {
      const a = Math.PI * (0.62 + k * 0.19);
      const wob = 1.15 + 0.12 * Math.sin(this.time * 7 + k * 1.7);
      r.circle(s.x + Math.cos(a) * s.r * 1.4 * wob, s.y + Math.sin(a) * s.r * 0.7 * wob, 2 + (k % 2)).fill({ color: CREEK.foam, alpha: 0.55 * clear });
    }
  }
}

/** The waterline, ragged rather than ruled. */
function shoreY(x: number, top: number): number {
  return top + 6 * Math.sin(x / 70) + 4 * Math.sin(x / 23 + 1);
}

function lerp(a: number, b: number, t: number): number {
  const ch = (shift: number): number => Math.round(((a >> shift) & 0xff) + ((((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t)) << shift;
  return ch(16) | ch(8) | ch(0);
}
