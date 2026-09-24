import { Container, Graphics, Text } from 'pixi.js';
import type { PanningSession } from '../sim';

/**
 * The assay office in town: a counter and a balance scale. The vial's gold sits in the scale's
 * pan and tips the beam by its weight; the sale itself happens through the HUD.
 */
export class TownView extends Container {
  private readonly g = new Graphics();
  private readonly sign = new Text({ text: 'ASSAY OFFICE · GOLD BOUGHT', style: { fill: 0xe8d9a8, fontSize: 22, fontFamily: 'Georgia, serif', letterSpacing: 2 } });
  private width_ = 800;
  private height_ = 600;
  private tip = 0;
  private time = 0;

  constructor() {
    super();
    this.sign.anchor.set(0.5, 0);
    this.addChild(this.g, this.sign);
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.sign.position.set(width / 2, height * 0.08);
  }

  update(dt: number, session: PanningSession): void {
    this.time += dt;
    const W = this.width_;
    const H = this.height_;
    const counterY = H * 0.62;
    const g = this.g.clear();

    // Plank wall, window light, and the counter.
    g.rect(0, 0, W, H).fill(0x4a3624);
    for (let x = 0; x < W; x += 46) g.moveTo(x, 0).lineTo(x, counterY).stroke({ width: 2, color: 0x3a2a1c });
    g.rect(W * 0.72, H * 0.18, W * 0.18, H * 0.26).fill({ color: 0xcfd9c8, alpha: 0.25 });
    g.rect(0, counterY, W, H - counterY).fill(0x5c3f27);
    g.rect(0, counterY, W, 10).fill(0x7a5534);

    // Balance scale: beam tips toward the gold, easing as weight changes.
    const mg = session.vialMg;
    const target = Math.min(0.28, Math.sqrt(mg) * 0.02);
    this.tip += (target - this.tip) * Math.min(1, dt * 3);
    const cx = W / 2;
    const postTop = counterY - H * 0.34;
    const arm = Math.min(W * 0.16, 170);
    g.rect(cx - 5, postTop, 10, counterY - postTop).fill(0xa8893f);
    g.rect(cx - 40, counterY - 10, 80, 10).fill(0x8a6f33);
    const dx = Math.cos(this.tip) * arm;
    const dy = Math.sin(this.tip) * arm;
    const left = { x: cx - dx, y: postTop + dy };
    const right = { x: cx + dx, y: postTop - dy };
    g.moveTo(left.x, left.y).lineTo(right.x, right.y).stroke({ width: 5, color: 0xc8a64a });
    g.circle(cx, postTop, 7).fill(0xc8a64a);
    for (const end of [left, right]) {
      const panY = end.y + 70;
      g.moveTo(end.x, end.y).lineTo(end.x - 34, panY).moveTo(end.x, end.y).lineTo(end.x + 34, panY).stroke({ width: 1.5, color: 0x9a8a60 });
      g.ellipse(end.x, panY, 40, 8).fill(0xb8943f);
    }

    // The gold on the left pan: a small heap that grows with weight and catches the light.
    if (mg > 0) {
      const heap = Math.min(22, 4 + Math.sqrt(mg) * 1.2);
      const panY = left.y + 70;
      g.ellipse(left.x, panY - heap * 0.35, heap, heap * 0.45).fill(0xe6b940);
      const shimmer = 0.5 + 0.5 * Math.sin(this.time * 4);
      g.circle(left.x - heap * 0.3, panY - heap * 0.5, 2).fill({ color: 0xfff0a8, alpha: shimmer });
    }
    // Brass weights on the right pan balance it out.
    const weights = Math.min(5, Math.ceil(Math.sqrt(mg) / 3));
    for (let i = 0; i < weights; i++) g.rect(right.x - 24 + i * 10, right.y + 58 - (i % 2) * 4, 8, 10).fill(0x8a6f33);
  }
}
