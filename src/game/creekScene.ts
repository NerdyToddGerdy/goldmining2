import { Container, Graphics } from 'pixi.js';

/** Home Creek backdrop: the gravel bank and the moving creek the player pans in. */
export class CreekScene extends Container {
  private readonly bank = new Graphics();
  private readonly water = new Graphics();
  private readonly ripples = new Graphics();
  private viewWidth = 0;
  private viewHeight = 0;
  private time = 0;
  private murk = 0;

  constructor() {
    super();
    this.addChild(this.bank, this.water, this.ripples);
  }

  /** Top of the water, in screen pixels. */
  get waterTop(): number {
    return this.viewHeight * 0.22;
  }

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.bank.clear().rect(0, 0, width, this.waterTop).fill(0x5b5236);
    for (let i = 0; i < 40; i++) {
      const x = (i * 97.3) % width;
      const y = ((i * 53.1) % this.waterTop) * 0.9;
      this.bank.circle(x, y, 3 + (i % 5) * 2).fill(i % 3 ? 0x6e6446 : 0x4c4430);
    }
    this.water.clear().rect(0, this.waterTop, width, height - this.waterTop).fill(0x2f5a5e);
    const murk = this.murk;
    this.murk = -1;
    this.setMurk(murk);
  }

  /**
   * How muddy the water is (a wash tub on dry ground clouds with every pan): the water browns and
   * the ripples fade. 0 is a clear creek.
   */
  setMurk(murk: number): void {
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
    for (let i = 0; i < 16; i++) {
      const y = top + ((i + 0.5) / 16) * (this.viewHeight - top);
      const drift = ((this.time * 60 + i * 137) % (this.viewWidth + 200)) - 100;
      this.ripples.moveTo(drift, y).lineTo(drift + 80 + (i % 3) * 30, y);
    }
    this.ripples.stroke({ width: 2, color: 0x7fb3b0, alpha: 0.35 * (1 - 0.8 * Math.max(0, this.murk)) });
  }
}
