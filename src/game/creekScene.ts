import { Container, Graphics } from 'pixi.js';
import { createRng } from '../sim';

/**
 * Placeholder Home Creek view: a gravel bank, moving water, and a pan of gravel held in it.
 * Visual only; the pan prototype will drive this from the simulation.
 */
export class CreekScene extends Container {
  private readonly bank = new Graphics();
  private readonly water = new Graphics();
  private readonly ripples = new Graphics();
  private readonly pan = new Container();
  private readonly pebbles: { x: number; y: number; r: number; color: number }[];
  private viewWidth = 0;
  private viewHeight = 0;
  private time = 0;

  constructor(seed: number) {
    super();
    const rng = createRng(seed);
    const colors = [0x8a7a62, 0x6f6454, 0x9c8f78, 0x5a5145, 0x2e2a26];
    this.pebbles = Array.from({ length: 70 }, () => {
      const angle = rng.range(0, Math.PI * 2);
      const dist = Math.sqrt(rng.next()) * 0.8;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        r: rng.range(0.025, 0.07),
        color: colors[rng.int(0, colors.length - 1)] ?? 0x8a7a62,
      };
    });
    this.addChild(this.bank, this.water, this.ripples, this.pan);
  }

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    const waterTop = height * 0.38;

    this.bank.clear().rect(0, 0, width, waterTop).fill(0x5b5236);
    this.water.clear().rect(0, waterTop, width, height - waterTop).fill(0x2f5a5e);

    const radius = Math.min(width, height) * 0.28;
    this.pan.position.set(width / 2, waterTop + (height - waterTop) * 0.5);
    this.pan.removeChildren().forEach((c) => c.destroy());
    const body = new Graphics()
      .ellipse(0, 0, radius, radius * 0.62).fill(0x2b2b2b).stroke({ width: radius * 0.06, color: 0x4a4a4a })
      .ellipse(0, 0, radius * 0.78, radius * 0.48).fill(0x353433);
    const gravel = new Graphics();
    for (const p of this.pebbles) {
      gravel.circle(p.x * radius * 0.72, p.y * radius * 0.44, p.r * radius).fill(p.color);
    }
    this.pan.addChild(body, gravel);
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const waterTop = this.viewHeight * 0.38;

    this.ripples.clear();
    for (let i = 0; i < 14; i++) {
      const y = waterTop + ((i + 0.5) / 14) * (this.viewHeight - waterTop);
      const drift = ((this.time * 60 + i * 137) % (this.viewWidth + 200)) - 100;
      this.ripples.moveTo(drift, y).lineTo(drift + 80 + (i % 3) * 30, y);
    }
    this.ripples.stroke({ width: 2, color: 0x7fb3b0, alpha: 0.35 });

    this.pan.y = waterTop + (this.viewHeight - waterTop) * 0.5 + Math.sin(this.time * 1.3) * 3;
  }
}
