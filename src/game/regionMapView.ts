import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import type { Creek, Region } from '../sim';

/**
 * The region as a hand-drawn drainage map: the river, the Home Creek, each stretch found by
 * following a lead, and the town. Click a place to walk there.
 *
 * Found stretches are tributaries spaced evenly along the river, in the order found, in staggered
 * rows upstream. The spacing tightens and the labels shrink as more are found, so there is no
 * fixed limit on how many fit. (Claim fees, not the map, are what should keep the count sensible.)
 */

export type RegionPlace = { readonly kind: 'creek'; readonly creek: Creek } | { readonly kind: 'town' };

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
  /** Screen positions of each creek, recomputed when the size or the creek count changes. */
  private positions = new Map<Creek, { x: number; y: number }>();
  private positionKey = '';
  private claimStatus: (creek: Creek) => 'held' | 'lapsed' | 'released' = () => 'held';

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

  /** How each stretch's claim stands: released ones are drawn hollow, lapsed ones crossed. */
  setClaimStatus(status: (creek: Creek) => 'held' | 'lapsed' | 'released'): void {
    this.claimStatus = status;
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
      const site = creek.profile.site;
      // A dry wash is drawn as a dashed line: water only runs in it after a storm.
      if (site === 'dryWash') {
        for (let t = 0; t < 1; t += 0.08) {
          const a = bezier(p, riverY, t);
          const b = bezier(p, riverY, Math.min(1, t + 0.04));
          g.moveTo(a.x, a.y).lineTo(b.x, b.y);
        }
        g.stroke({ width: 3, color: 0xa08a5a });
      } else {
        g.moveTo(p.x, p.y).quadraticCurveTo(p.x - 40, (p.y + riverY) / 2, p.x + 20, riverY).stroke({ width: site === 'gravelBar' ? 6 : site === 'ravine' ? 2 : 3, color: RIVER });
      }
      // Ravines get a pair of steep contour ticks; gravel bars a pale bar by their dot.
      if (site === 'ravine') g.moveTo(p.x - 14, p.y + 16).lineTo(p.x - 6, p.y + 2).moveTo(p.x + 14, p.y + 16).lineTo(p.x + 6, p.y + 2).stroke({ width: 2, color: INK, alpha: 0.6 });
      if (site === 'gravelBar') g.ellipse(p.x + 16, p.y + 4, 9, 4).fill({ color: 0xb8a57c });
      // Old workings: crossed pick and shovel, the map-maker's mark for abandoned diggings.
      if (site === 'oldDiggings') {
        g.moveTo(p.x + 10, p.y - 14).lineTo(p.x + 22, p.y - 2).moveTo(p.x + 22, p.y - 14).lineTo(p.x + 10, p.y - 2).stroke({ width: 2, color: INK, alpha: 0.75 });
      }
    }

    const town = this.townPos();
    g.moveTo(town.x, town.y + 14).lineTo(this.creekPos(this.region.home).x, this.creekPos(this.region.home).y).stroke({ width: 2, color: INK, alpha: 0.35 });
    g.rect(town.x - 14, town.y - 10, 28, 20).fill(INK);
    g.poly([town.x - 18, town.y - 10, town.x, town.y - 24, town.x + 18, town.y - 10]).fill(INK);
    if (this.hovered?.kind === 'town') g.circle(town.x, town.y - 4, 30).stroke({ width: 2, color: INK });

    for (const creek of this.region.creeks) {
      const p = this.creekPos(creek);
      const worked = creek.creekSpots.every((s) => creek.isWorkedOut(s)) && !creek.profile.renewing;
      const claim = creek === this.region.home ? 'held' : this.claimStatus(creek);
      if (claim === 'released') g.circle(p.x, p.y, 8).stroke({ width: 2, color: INK, alpha: 0.6 });
      else g.circle(p.x, p.y, 9).fill(worked ? 0x9a8a6a : INK);
      if (claim === 'lapsed') g.moveTo(p.x - 10, p.y - 10).lineTo(p.x + 10, p.y + 10).stroke({ width: 2, color: 0xa0502c });
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
    const found = this.region.creeks.length - 1;
    const size = found > 14 ? 11 : found > 8 ? 13 : 15;
    const style = { fill: INK, fontSize: this.small ? Math.min(12, size) : size, fontFamily: 'Georgia, serif', align: 'center' as const };
    for (const creek of this.region.creeks) {
      const p = this.creekPos(creek);
      // Crowded maps put names on two lines so neighbours don't run into each other.
      const name = found > 6 && creek !== this.region.home ? creek.profile.name.replace(' ', '\n') : creek.profile.name;
      const label = new Text({ text: name, style });
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
   * Home Creek sits low in the middle. Found stretches are spread evenly across the map in the
   * order found, alternating between rows upstream (a third row once there are many), and kept
   * left of the notebook panel on the right.
   */
  private creekPos(creek: Creek): { x: number; y: number } {
    this.placeCreeks();
    return this.positions.get(creek) ?? { x: this.width_ * 0.4, y: this.height_ * 0.6 };
  }

  private placeCreeks(): void {
    const W = this.width_;
    const H = this.height_;
    const creeks = this.region.creeks;
    const key = `${W}x${H}:${creeks.length}`;
    if (key === this.positionKey) return;
    this.positionKey = key;
    this.positions = new Map([[this.region.home, { x: W * 0.4, y: H * 0.6 }]]);
    const found = creeks.slice(1);
    const left = W * 0.1;
    const right = this.rightEdge;
    const rows = found.length > 8 ? 3 : 2;
    // Clear of the hint and the inspect panel in the top-left; the leftmost stretch takes the
    // lowest row, furthest from that panel.
    const top = Math.max(H * 0.17, 96);
    const rowGap = Math.max(28, (H * 0.52 - top) / rows);
    found.forEach((creek, i) => {
      const x = found.length === 1 ? (left + right) / 2 : left + ((right - left) * i) / (found.length - 1);
      this.positions.set(creek, { x, y: top + (rows - 1 - (i % rows)) * rowGap });
    });
  }

  /** Phones held sideways and small tablets: the notebook starts folded, and type is smaller. */
  private get small(): boolean {
    return this.height_ < 520 || this.width_ < 760;
  }

  /**
   * Where found stretches stop: left of the notebook panel (up to 340px wide, plus half a label),
   * or nearly the full width on small screens, where the notebook starts folded into a button.
   */
  private get rightEdge(): number {
    return this.small ? this.width_ * 0.88 : Math.max(this.width_ * 0.55, this.width_ - 440);
  }

  /** How close a tap must be to pick a creek: tighter when they are packed together. */
  private get pickRadius(): number {
    const found = Math.max(1, this.region.creeks.length - 1);
    const spacing = (this.rightEdge - this.width_ * 0.1) / found;
    return Math.max(14, Math.min(26, spacing));
  }

  private townPos(): { x: number; y: number } {
    return { x: this.width_ * 0.12, y: this.height_ * 0.64 };
  }

  private placeAt(x: number, y: number): RegionPlace | null {
    const t = this.townPos();
    if (Math.hypot(x - t.x, y - t.y) < 30) return { kind: 'town' };
    for (const creek of this.region.creeks) {
      const p = this.creekPos(creek);
      if (Math.hypot(x - p.x, y - p.y) < this.pickRadius) return { kind: 'creek', creek };
    }
    return null;
  }
}

/** A point along a tributary's curve (matching the quadratic drawn for wet creeks). */
function bezier(p: { x: number; y: number }, riverY: number, t: number): { x: number; y: number } {
  const c = { x: p.x - 40, y: (p.y + riverY) / 2 };
  const e = { x: p.x + 20, y: riverY };
  return { x: (1 - t) ** 2 * p.x + 2 * (1 - t) * t * c.x + t ** 2 * e.x, y: (1 - t) ** 2 * p.y + 2 * (1 - t) * t * c.y + t ** 2 * e.y };
}
