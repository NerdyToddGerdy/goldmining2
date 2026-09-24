import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import type { Creek, Region } from '../sim';

/**
 * The region as a hand-drawn drainage map: the river, the Home Creek, each stretch found by
 * following a lead, and the town. Click a place to walk there.
 */

export type RegionPlace = { readonly kind: 'creek'; readonly creek: Creek } | { readonly kind: 'town' };

/** Map positions (fractions of the view) for found stretches, in the order they are found. */
const CREEK_SLOTS: readonly (readonly [number, number])[] = [
  [0.28, 0.3],
  [0.52, 0.24],
  [0.12, 0.34],
  [0.4, 0.14],
  [0.6, 0.42],
  [0.22, 0.48],
  [0.64, 0.12],
  [0.08, 0.16],
];

const PAPER = 0xd9c9a3;
const INK = 0x4a3a28;
const RIVER = 0x5f8a8f;

export class RegionMapView extends Container {
  private readonly g = new Graphics();
  private readonly labels = new Container();
  private width_ = 800;
  private height_ = 600;
  private hovered: RegionPlace | null = null;
  private labelKey = '';

  constructor(
    private readonly region: Region,
    private readonly onPick: (place: RegionPlace) => void,
  ) {
    super();
    this.addChild(this.g, this.labels);
    this.eventMode = 'static';
    this.on('globalpointermove', (e: FederatedPointerEvent) => (this.hovered = this.placeAt(e.global.x, e.global.y)));
    this.on('pointertap', (e: FederatedPointerEvent) => {
      const place = this.placeAt(e.global.x, e.global.y);
      if (place) this.onPick(place);
    });
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
    this.labelKey = '';
  }

  update(current: Creek | null): void {
    const W = this.width_;
    const H = this.height_;
    const g = this.g.clear();
    g.rect(0, 0, W, H).fill(PAPER);
    for (let i = 0; i < 60; i++) g.circle((i * 151.3) % W, (i * 83.7) % H, 1 + (i % 3)).fill({ color: 0xb8a57c, alpha: 0.5 });

    // The river along the bottom, with each creek's tributary running down into it.
    const riverY = H * 0.78;
    g.moveTo(0, riverY).bezierCurveTo(W * 0.3, riverY - 30, W * 0.6, riverY + 30, W, riverY - 10).stroke({ width: 10, color: RIVER });
    for (const creek of this.region.creeks) {
      const p = this.creekPos(creek);
      g.moveTo(p.x, p.y).quadraticCurveTo(p.x - 40, (p.y + riverY) / 2, p.x + 20, riverY).stroke({ width: 3, color: RIVER });
    }

    const town = this.townPos();
    g.moveTo(town.x, town.y + 14).lineTo(this.creekPos(this.region.home).x, this.creekPos(this.region.home).y).stroke({ width: 2, color: INK, alpha: 0.35 });
    g.rect(town.x - 14, town.y - 10, 28, 20).fill(INK);
    g.poly([town.x - 18, town.y - 10, town.x, town.y - 24, town.x + 18, town.y - 10]).fill(INK);
    if (this.hovered?.kind === 'town') g.circle(town.x, town.y - 4, 30).stroke({ width: 2, color: INK });

    for (const creek of this.region.creeks) {
      const p = this.creekPos(creek);
      const worked = creek.creekSpots.every((s) => creek.isWorkedOut(s)) && !creek.profile.renewing;
      g.circle(p.x, p.y, 9).fill(worked ? 0x9a8a6a : INK);
      if (creek === current) g.circle(p.x, p.y, 16).stroke({ width: 3, color: 0xa0502c });
      if (this.hovered?.kind === 'creek' && this.hovered.creek === creek) g.circle(p.x, p.y, 24).stroke({ width: 2, color: INK });
    }
    this.refreshLabels();
  }

  private refreshLabels(): void {
    const key = `${this.width_}x${this.height_}:${this.region.creeks.map((c) => c.id).join(',')}`;
    if (key === this.labelKey) return;
    this.labelKey = key;
    this.labels.removeChildren().forEach((c) => c.destroy());
    const style = { fill: INK, fontSize: 15, fontFamily: 'Georgia, serif' };
    for (const creek of this.region.creeks) {
      const p = this.creekPos(creek);
      const label = new Text({ text: creek.profile.name, style });
      label.anchor.set(0.5, 0);
      label.position.set(p.x, p.y + 14);
      this.labels.addChild(label);
    }
    const t = this.townPos();
    const town = new Text({ text: 'Town', style: { ...style, fontStyle: 'italic' } });
    town.anchor.set(0.5, 0);
    town.position.set(t.x, t.y + 14);
    this.labels.addChild(town);
  }

  /**
   * Home Creek sits low in the middle; found stretches take slots upstream in the order found,
   * kept left of the notebook panel on the right.
   */
  private creekPos(creek: Creek): { x: number; y: number } {
    const index = this.region.creeks.indexOf(creek);
    if (index <= 0) return { x: this.width_ * 0.4, y: this.height_ * 0.6 };
    const slot = CREEK_SLOTS[(index - 1) % CREEK_SLOTS.length]!;
    const lap = Math.floor((index - 1) / CREEK_SLOTS.length);
    return { x: this.width_ * slot[0] + lap * 24, y: this.height_ * slot[1] + lap * 18 };
  }

  private townPos(): { x: number; y: number } {
    return { x: this.width_ * 0.12, y: this.height_ * 0.64 };
  }

  private placeAt(x: number, y: number): RegionPlace | null {
    const t = this.townPos();
    if (Math.hypot(x - t.x, y - t.y) < 30) return { kind: 'town' };
    for (const creek of this.region.creeks) {
      const p = this.creekPos(creek);
      if (Math.hypot(x - p.x, y - p.y) < 26) return { kind: 'creek', creek };
    }
    return null;
  }
}
