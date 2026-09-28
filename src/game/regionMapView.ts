import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import type { Creek, Region } from '../sim';
import { TOWN, layoutRegion, mouthOf, riverY, type MapPoint } from './regionLayout';

/**
 * The region as a hand-drawn drainage map: the river winding across it, the town on its bank, the
 * Home Creek close by, and each stretch found by following a lead, spread out around them on both
 * banks (see regionLayout). Tap a place to walk there.
 *
 * The map has a camera: it opens fitted to everything found, and can be zoomed (mouse wheel, pinch,
 * or the + and − keys) and dragged, so a crowded map is read by zooming in rather than by shrinking
 * its type.
 */

export type RegionPlace = { readonly kind: 'creek'; readonly creek: Creek } | { readonly kind: 'town' };

const PAPER = 0xd9c9a3;
const INK = 0x4a3a28;
const RIVER = 0x5f8a8f;
/** How far a finger or mouse may move and still count as a tap, not a drag. */
const TAP_SLOP = 8;

export class RegionMapView extends Container {
  private readonly g = new Graphics();
  private readonly labels = new Container();
  private width_ = 800;
  private height_ = 600;
  private hovered: RegionPlace | null = null;
  private claimStatus: (creek: Creek) => 'held' | 'lapsed' | 'released' = () => 'held';

  /** Map positions by creek id, recomputed when a stretch is found. */
  private places = new Map<number, MapPoint>();
  private placesKey = '';
  /** Camera: screen = map × scale + offset. */
  private zoom = 1;
  private offset = { x: 0, y: 0 };
  /** Refit when the screen or the set of places changes; zooming by hand holds until then. */
  private fitKey = '';
  private labelKey = '';
  private readonly labelFor = new Map<number | 'town', Text>();

  /** Pointers down on the map, for dragging and pinching. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture: { start: { x: number; y: number }; offset: { x: number; y: number }; zoom: number; spread: number; moved: boolean } | null = null;

  constructor(
    private readonly region: Region,
    private readonly onPick: (place: RegionPlace) => void,
  ) {
    super();
    this.addChild(this.g, this.labels);
    this.eventMode = 'static';
    this.on('pointerdown', (e: FederatedPointerEvent) => this.down(e));
    this.on('globalpointermove', (e: FederatedPointerEvent) => this.move(e));
    this.on('pointerup', (e: FederatedPointerEvent) => this.up(e));
    this.on('pointerupoutside', (e: FederatedPointerEvent) => this.up(e, false));
    this.on('wheel', (e: FederatedWheelEvent) => this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.global.x, e.global.y));
  }

  /** How each stretch's claim stands: released ones are drawn hollow, lapsed ones crossed. */
  setClaimStatus(status: (creek: Creek) => 'held' | 'lapsed' | 'released'): void {
    this.claimStatus = status;
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
  }

  /** Zoom in (>1) or out (<1) about the middle of the map area; 0 fits everything back in view. */
  zoomBy(factor: number): void {
    if (factor === 0) return this.fit();
    const view = this.viewport;
    this.zoomAt(factor, (view.left + view.right) / 2, (view.top + view.bottom) / 2);
  }

  /** Screen position of a stretch. */
  creekPos(creek: Creek): { x: number; y: number } {
    return this.toScreen(this.placeOf(creek));
  }

  /** The stretch the player is at, whose name always shows. */
  private current: Creek | null = null;

  update(current: Creek | null): void {
    this.current = current;
    this.placeAll();
    const fitKey = `${this.width_}x${this.height_}:${this.placesKey}`;
    if (fitKey !== this.fitKey) {
      this.fitKey = fitKey;
      this.fit();
    }
    const W = this.width_;
    const H = this.height_;
    const g = this.g.clear();
    g.rect(0, 0, W, H).fill(PAPER);
    for (let i = 0; i < 60; i++) g.circle((i * 151.3) % W, (i * 83.7) % H, 1 + (i % 3)).fill({ color: 0xb8a57c, alpha: 0.5 });

    // The river, across the whole view.
    const x0 = this.toMap({ x: 0, y: 0 }).x - 40;
    const x1 = this.toMap({ x: W, y: 0 }).x + 40;
    const step = 12 / this.zoom;
    const start = this.toScreen({ x: x0, y: riverY(x0) });
    g.moveTo(start.x, start.y);
    for (let x = x0 + step; x <= x1; x += step) {
      const p = this.toScreen({ x, y: riverY(x) });
      g.lineTo(p.x, p.y);
    }
    g.stroke({ width: Math.max(6, 10 * Math.min(1.4, this.zoom)), color: RIVER });

    // Each creek's tributary, running down (or up) to the river.
    for (const creek of this.region.creeks) {
      const at = this.placeOf(creek);
      const p = this.toScreen(at);
      const mouth = this.toScreen(mouthOf(at));
      const bend = { x: p.x - 40 * this.zoom, y: (p.y + mouth.y) / 2 };
      const site = creek.profile.site;
      if (site === 'dryWash') {
        // A dry wash is dashed: water only runs in it after a storm.
        for (let t = 0; t < 1; t += 0.08) {
          const a = quad(p, bend, mouth, t);
          const b = quad(p, bend, mouth, Math.min(1, t + 0.04));
          g.moveTo(a.x, a.y).lineTo(b.x, b.y);
        }
        g.stroke({ width: 3, color: 0xa08a5a });
      } else {
        g.moveTo(p.x, p.y).quadraticCurveTo(bend.x, bend.y, mouth.x, mouth.y).stroke({ width: site === 'gravelBar' ? 6 : site === 'ravine' ? 2 : 3, color: RIVER });
      }
      // Ravines get a pair of steep contour ticks; gravel bars a pale bar; old workings a crossed pick and shovel.
      if (site === 'ravine') g.moveTo(p.x - 14, p.y + 16).lineTo(p.x - 6, p.y + 2).moveTo(p.x + 14, p.y + 16).lineTo(p.x + 6, p.y + 2).stroke({ width: 2, color: INK, alpha: 0.6 });
      if (site === 'gravelBar') g.ellipse(p.x + 16, p.y + 4, 9, 4).fill({ color: 0xb8a57c });
      if (site === 'oldDiggings') g.moveTo(p.x + 10, p.y - 14).lineTo(p.x + 22, p.y - 2).moveTo(p.x + 22, p.y - 14).lineTo(p.x + 10, p.y - 2).stroke({ width: 2, color: INK, alpha: 0.75 });
    }

    // The town, and the trail from it to the Home Creek.
    const town = this.toScreen(TOWN);
    const home = this.creekPos(this.region.home);
    g.moveTo(town.x, town.y + 14).lineTo(home.x, home.y).stroke({ width: 2, color: INK, alpha: 0.35 });
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
    this.placeLabels();
  }

  // ---- places and the camera ----

  private placeAll(): void {
    const key = this.region.creeks.map((c) => c.id).join(',');
    if (key === this.placesKey) return;
    this.placesKey = key;
    this.places = layoutRegion(this.region.creeks.map((c) => c.id));
  }

  private placeOf(creek: Creek): MapPoint {
    this.placeAll();
    return this.places.get(creek.id) ?? TOWN;
  }

  private toScreen(p: MapPoint): { x: number; y: number } {
    return { x: p.x * this.zoom + this.offset.x, y: p.y * this.zoom + this.offset.y };
  }

  private toMap(p: { x: number; y: number }): MapPoint {
    return { x: (p.x - this.offset.x) / this.zoom, y: (p.y - this.offset.y) / this.zoom };
  }

  /**
   * The part of the screen the map should use: below the hint and readouts at the top, above the
   * button bar, and left of the notebook on a wide screen (it starts folded on small ones).
   */
  private get viewport(): { left: number; right: number; top: number; bottom: number } {
    const small = this.height_ < 520 || this.width_ < 760;
    return { left: 16, right: this.width_ - (small ? 16 : 380), top: small ? 100 : 125, bottom: this.height_ - (small ? 60 : 70) };
  }

  /** Fit every place (and the town) into the viewport, with room for labels. */
  private fit(): void {
    const points = [TOWN, ...this.places.values()];
    const pad = 70;
    const minX = Math.min(...points.map((p) => p.x)) - pad;
    const maxX = Math.max(...points.map((p) => p.x)) + pad;
    const minY = Math.min(...points.map((p) => p.y)) - pad;
    const maxY = Math.max(...points.map((p) => p.y)) + pad;
    const view = this.viewport;
    this.zoom = clamp(Math.min((view.right - view.left) / (maxX - minX), (view.bottom - view.top) / (maxY - minY)), 0.25, 1.4);
    this.offset = {
      x: (view.left + view.right) / 2 - ((minX + maxX) / 2) * this.zoom,
      y: (view.top + view.bottom) / 2 - ((minY + maxY) / 2) * this.zoom,
    };
  }

  /** Zoom by `factor` keeping the map point under (sx, sy) where it is. */
  private zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.toMap({ x: sx, y: sy });
    this.zoom = clamp(this.zoom * factor, 0.2, 3);
    this.offset = { x: sx - before.x * this.zoom, y: sy - before.y * this.zoom };
  }

  // ---- pointers: tap to pick, drag to pan, pinch to zoom ----

  private down(e: FederatedPointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    this.gesture = this.startGesture();
  }

  private move(e: FederatedPointerEvent): void {
    if (!this.pointers.has(e.pointerId)) {
      if (this.pointers.size === 0) this.hovered = this.placeAt(e.global.x, e.global.y);
      return;
    }
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    const g = this.gesture;
    if (!g) return;
    const now = this.centroid();
    if (!g.moved && Math.hypot(now.x - g.start.x, now.y - g.start.y) < TAP_SLOP && this.pointers.size === 1) return;
    g.moved = true;
    this.hovered = null;
    // Pinch: zoom by how far the fingers have spread, about where they started.
    if (this.pointers.size >= 2 && g.spread > 0) {
      const scale = clamp(g.zoom * (this.spread() / g.spread), 0.2, 3);
      const anchor = { x: (g.start.x - g.offset.x) / g.zoom, y: (g.start.y - g.offset.y) / g.zoom };
      this.zoom = scale;
      this.offset = { x: now.x - anchor.x * scale, y: now.y - anchor.y * scale };
      return;
    }
    this.offset = { x: g.offset.x + now.x - g.start.x, y: g.offset.y + now.y - g.start.y };
  }

  private up(e: FederatedPointerEvent, inside = true): void {
    const g = this.gesture;
    this.pointers.delete(e.pointerId);
    if (inside && g && !g.moved && this.pointers.size === 0) {
      const place = this.placeAt(e.global.x, e.global.y);
      if (place) this.onPick(place);
    }
    // A finger lifting mid-pinch carries on as a drag with the one left.
    this.gesture = this.pointers.size > 0 ? { ...this.startGesture(), moved: true } : null;
  }

  private startGesture(): NonNullable<RegionMapView['gesture']> {
    return { start: this.centroid(), offset: { ...this.offset }, zoom: this.zoom, spread: this.spread(), moved: false };
  }

  private centroid(): { x: number; y: number } {
    const all = [...this.pointers.values()];
    if (all.length === 0) return { x: 0, y: 0 };
    return { x: all.reduce((n, p) => n + p.x, 0) / all.length, y: all.reduce((n, p) => n + p.y, 0) / all.length };
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private placeAt(x: number, y: number): RegionPlace | null {
    const t = this.toScreen(TOWN);
    if (Math.hypot(x - t.x, y - t.y) < 30) return { kind: 'town' };
    let best: { creek: Creek; d: number } | null = null;
    for (const creek of this.region.creeks) {
      const p = this.creekPos(creek);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < 26 && (!best || d < best.d)) best = { creek, d };
    }
    return best ? { kind: 'creek', creek: best.creek } : null;
  }

  // ---- labels: made once per place, kept at a steady size, moved with the camera ----

  private placeLabels(): void {
    const key = this.placesKey;
    if (key !== this.labelKey) {
      this.labelKey = key;
      this.labels.removeChildren().forEach((c) => c.destroy());
      this.labelFor.clear();
      const small = this.height_ < 520 || this.width_ < 760;
      const style = { fill: INK, fontSize: small ? 12 : 14, fontFamily: 'Georgia, serif', align: 'center' as const };
      for (const creek of this.region.creeks) {
        const label = new Text({ text: creek.profile.name, style });
        label.anchor.set(0.5, 0);
        this.labels.addChild(label);
        this.labelFor.set(creek.id, label);
      }
      const town = new Text({ text: 'Town', style: { ...style, fontStyle: 'italic' } });
      town.anchor.set(0.5, 0);
      this.labels.addChild(town);
      this.labelFor.set('town', town);
    }
    // Names that would run into one already written are left off until zoomed in: the place
    // you're at, the Home Creek and the town first, then the rest in the order found.
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const put = (label: Text | undefined, at: { x: number; y: number }): void => {
      if (!label) return;
      label.position.set(at.x, at.y + 14);
      const box = { l: at.x - label.width / 2 - 3, r: at.x + label.width / 2 + 3, t: at.y + 12, b: at.y + 14 + label.height };
      label.visible = !placed.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
      if (label.visible) placed.push(box);
    };
    const current = this.current;
    const rank = (c: Creek): number => (c === current ? 0 : c.profile.site === 'homeCreek' ? 1 : 2);
    const order = [...this.region.creeks].sort((a, b) => rank(a) - rank(b));
    put(this.labelFor.get('town'), this.toScreen(TOWN));
    for (const creek of order) put(this.labelFor.get(creek.id), this.creekPos(creek));
  }
}

function quad(a: { x: number; y: number }, c: { x: number; y: number }, e: { x: number; y: number }, t: number): { x: number; y: number } {
  return { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * e.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * e.y };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
