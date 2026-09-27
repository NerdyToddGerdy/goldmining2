import { Container, Graphics } from 'pixi.js';

/**
 * Where the player pans: the gravel bank and the moving creek, or in town the wash trough in the
 * assay office's back room (plank wall above, still water in a galvanized trough).
 */
export type PanSetting = 'creek' | 'town';

export class CreekScene extends Container {
  private readonly bank = new Graphics();
  private readonly water = new Graphics();
  private readonly ripples = new Graphics();
  private viewWidth = 0;
  private viewHeight = 0;
  private time = 0;
  private murk = 0;
  private setting: PanSetting = 'creek';

  constructor() {
    super();
    this.addChild(this.bank, this.water, this.ripples);
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
    this.bank.clear().rect(0, 0, width, top).fill(0x5b5236);
    for (let i = 0; i < 40; i++) {
      const x = (i * 97.3) % width;
      const y = ((i * 53.1) % top) * 0.9;
      this.bank.circle(x, y, 3 + (i % 5) * 2).fill(i % 3 ? 0x6e6446 : 0x4c4430);
    }
    this.water.clear().rect(0, top, width, height - top).fill(0x2f5a5e);
    const murk = this.murk;
    this.murk = -1;
    this.setMurk(murk);
  }

  /**
   * How muddy the water is (a wash tub on dry ground clouds with every pan): the water browns and
   * the ripples fade. 0 is a clear creek.
   */
  setMurk(murk: number): void {
    if (this.setting === 'town') return; // The trough's water is changed between pans.
    if (Math.abs(murk - this.murk) < 0.01) return;
    this.murk = murk;
    const t = Math.min(1, murk);
    const mix = (a: number, b: number, shift: number): number => Math.round(((a >> shift) & 0xff) + ((((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t)) << shift;
    const color = mix(0x2f5a5e, 0x6b5a3a, 16) | mix(0x2f5a5e, 0x6b5a3a, 8) | mix(0x2f5a5e, 0x6b5a3a, 0);
    this.water.clear().rect(0, this.waterTop, this.viewWidth, this.viewHeight - this.waterTop).fill(color);
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const top = this.waterTop;
    this.ripples.clear();
    if (this.setting === 'town') {
      // Still water: a few glints that shimmer in place instead of a current carrying them past.
      for (let i = 0; i < 10; i++) {
        const x = ((i * 211.7) % (this.viewWidth * 0.8)) + this.viewWidth * 0.1;
        const y = top + ((i * 0.37) % 1) * (this.viewHeight - top) * 0.9 + 10;
        const w = 30 + 12 * Math.sin(this.time * 1.3 + i);
        this.ripples.moveTo(x - w / 2, y).lineTo(x + w / 2, y);
      }
      this.ripples.stroke({ width: 2, color: 0x9fbfbf, alpha: 0.22 });
      return;
    }
    for (let i = 0; i < 16; i++) {
      const y = top + ((i + 0.5) / 16) * (this.viewHeight - top);
      const drift = ((this.time * 60 + i * 137) % (this.viewWidth + 200)) - 100;
      this.ripples.moveTo(drift, y).lineTo(drift + 80 + (i % 3) * 30, y);
    }
    this.ripples.stroke({ width: 2, color: 0x7fb3b0, alpha: 0.35 * (1 - 0.8 * Math.max(0, this.murk)) });
  }
}
