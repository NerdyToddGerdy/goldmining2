import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import type { DigSpot, GroundSign, Creek } from '../sim';
import { usingTouch } from './inputMode';

/**
 * Top-down view of a creek stretch. Ground signs are drawn physically at each spot (gravel bars
 * on inside bends, black-sand streaks, moss, exposed bedrock, trapping boulders), and dry side
 * gullies join the creek. Hovering names what the player notices and shows their own field
 * notes (pans and colour kept); it never reveals richness.
 */

export const SIGN_NAMES: Record<GroundSign, string> = {
  insideBend: 'inside of a bend',
  bedrockOutcrop: 'bedrock showing',
  blackSandStreak: 'black-sand streaks',
  mossLine: 'moss on the high-water rocks',
  boulderTrap: 'gravel packed behind a boulder',
};

const BANK = 0x5d5a38;
const WATER = 0x2f5a5e;
const GULLY = 0x8a7d5a;

export class CreekMapView extends Container {
  private readonly g = new Graphics();
  private readonly labels = new Container();
  private readonly tooltip = new Text({ text: '', style: { fill: 0xefe6cf, fontSize: 14, fontFamily: 'system-ui, sans-serif', wordWrap: true, wordWrapWidth: 260 } });
  private readonly tooltipBg = new Graphics();
  private readonly title = new Text({ text: '', style: { fill: 0xefe6cf, fontSize: 20, fontFamily: 'Georgia, serif', letterSpacing: 1 } });
  private width_ = 800;
  private height_ = 600;
  private hovered: DigSpot | null = null;
  /** Touch has no hover: the first tap selects a spot to read, the second digs. */
  selected: DigSpot | null = null;
  private time = 0;

  constructor(
    private creek: Creek,
    private readonly onPick: (spot: DigSpot) => void,
  ) {
    super();
    this.title.anchor.set(0.5, 0);
    this.addChild(this.g, this.labels, this.title, this.tooltipBg, this.tooltip);
    this.eventMode = 'static';
    this.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (e.pointerType === 'mouse') this.hovered = this.spotAt(e.global.x, e.global.y);
    });
    this.on('pointertap', (e: FederatedPointerEvent) => {
      const spot = this.spotAt(e.global.x, e.global.y);
      if (e.pointerType === 'mouse') {
        if (spot) this.onPick(spot);
        return;
      }
      this.hovered = null;
      if (spot && spot === this.selected) this.onPick(spot);
      else this.selected = spot;
    });
  }

  setCreek(creek: Creek): void {
    this.creek = creek;
    this.hovered = null;
    this.selected = null;
    this.layout(this.width_, this.height_);
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
    this.title.text = this.creek.profile.name;
    this.title.position.set(width / 2, this.short ? 36 : 58);
    this.labels.removeChildren().forEach((c) => c.destroy());
    const style = { fill: 0xefe6cf, fontSize: 13, fontFamily: 'Georgia, serif' };
    this.creek.creekSpots.forEach((spot, i) => this.addLabel(String(i + 1), spot, style));
    for (const spot of this.creek.gullySpots) this.addLabel('gully', spot, { ...style, fontSize: 11, fill: 0xd8ccaa });
  }

  private addLabel(text: string, spot: DigSpot, style: { fill: number; fontSize: number; fontFamily: string }): void {
    const p = this.screenPosition(spot);
    const label = new Text({ text, style });
    label.anchor.set(0.5);
    label.position.set(p.x, p.y + 26);
    this.labels.addChild(label);
  }

  update(dt: number): void {
    this.time += dt;
    const g = this.g.clear();
    const W = this.width_;
    const H = this.height_;
    g.rect(0, 0, W, H).fill(BANK);
    for (let i = 0; i < 80; i++) g.circle((i * 131.7) % W, (i * 71.3) % H, 2 + (i % 3)).fill(i % 2 ? 0x686440 : 0x4f4c2f);

    // Creek channel.
    const steps = 60;
    const points: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      points.push(x, this.creekY(x));
    }
    g.poly([...points, W, this.creekY(W) + 34, ...reversePairs(points).map((v, j) => (j % 2 ? v + 34 : v))]).fill(WATER);
    for (let i = 0; i < 12; i++) {
      const x = ((this.time * 50 + i * 97) % (W + 60)) - 30;
      const y = this.creekY(x) + 10 + (i % 3) * 7;
      g.moveTo(x, y).lineTo(x + 22, this.creekY(x + 22) + 10 + (i % 3) * 7);
    }
    g.stroke({ width: 2, color: 0x7fb3b0, alpha: 0.4 });

    for (const spot of this.creek.gullySpots) this.drawGully(g, spot);
    for (const spot of this.creek.spots) this.drawSpot(g, spot);
    this.drawTooltip();
  }

  private drawSpot(g: Graphics, spot: DigSpot): void {
    const p = this.screenPosition(spot);
    const toward = Math.sign(this.creekY(p.x) + 17 - p.y);

    for (const sign of spot.signs) {
      switch (sign) {
        case 'insideBend':
          g.ellipse(p.x, p.y + toward * 18, 44, 12).fill(0xb7a57c);
          break;
        case 'blackSandStreak':
          for (let i = 0; i < 3; i++) g.moveTo(p.x - 20 + i * 12, p.y + toward * 14).lineTo(p.x - 12 + i * 12, p.y + toward * 16).stroke({ width: 3, color: 0x15120f });
          break;
        case 'mossLine':
          for (let i = 0; i < 6; i++) g.circle(p.x + 22 + i * 5, p.y - 8 + (i % 2) * 4, 3.5).fill(0x4f7a3a);
          break;
        case 'bedrockOutcrop':
          g.poly([p.x - 36, p.y + 6, p.x - 28, p.y - 10, p.x - 16, p.y - 6, p.x - 14, p.y + 8]).fill(0x4d5560);
          break;
        case 'boulderTrap':
          g.circle(p.x + 26, p.y + 10, 11).fill(0x7c786f);
          for (let i = 0; i < 4; i++) g.circle(p.x + 14 - i * 4, p.y + 14, 2.5).fill(0xa9a393);
          break;
      }
    }

    const workedOut = this.creek.isWorkedOut(spot);
    const dug = spot.layers.some((l) => l.loads < l.initialLoads) || spot.spoil > 0;
    if (dug) {
      g.circle(p.x - 16, p.y - 12, Math.min(14, 4 + spot.spoil)).fill(0x5e4a33);
      g.circle(p.x, p.y, 10).fill(0x1b1712);
      if (spot.water > 0) g.circle(p.x, p.y, 10 * spot.water).fill(0x3f7479);
    }
    if (workedOut) {
      g.moveTo(p.x - 7, p.y - 7).lineTo(p.x + 7, p.y + 7).moveTo(p.x + 7, p.y - 7).lineTo(p.x - 7, p.y + 7).stroke({ width: 2, color: 0xcfc6ae });
    } else if (!dug) {
      // Stake marking a spot worth a look.
      g.moveTo(p.x, p.y + 6).lineTo(p.x, p.y - 14).stroke({ width: 3, color: 0x8a6a45 });
      g.poly([p.x, p.y - 14, p.x + 12, p.y - 10, p.x, p.y - 6]).fill(0xc9503b);
    }
    if (spot === this.hovered || spot === this.selected) g.circle(p.x, p.y, 30).stroke({ width: 2, color: 0xefe6cf, alpha: 0.6 });
  }

  /** A dry side channel running from the creek out to the edge of the view. */
  private drawGully(g: Graphics, spot: DigSpot): void {
    const { mouth, end } = this.gullyLine(spot);
    g.moveTo(mouth.x, mouth.y)
      .quadraticCurveTo(mouth.x + (end.x - mouth.x) * 0.2 - 30, (mouth.y + end.y) / 2, end.x, end.y)
      .stroke({ width: 16, color: GULLY, alpha: 0.9 });
    g.moveTo(mouth.x, mouth.y)
      .quadraticCurveTo(mouth.x + (end.x - mouth.x) * 0.2 - 30, (mouth.y + end.y) / 2, end.x, end.y)
      .stroke({ width: 4, color: 0x6b6044, alpha: 0.8 });
  }

  private drawTooltip(): void {
    const spot = this.hovered ?? this.selected;
    const action = usingTouch() ? 'Tap again to dig.' : 'Click to dig.';
    this.tooltip.visible = this.tooltipBg.visible = spot !== null;
    if (!spot) return;
    const state = this.creek.isWorkedOut(spot) ? 'Worked out.' : spot.spoil > 0 || spot.layers.some((l) => l.loads < l.initialLoads) ? 'You have dug here.' : 'Undug.';
    const notes = spot.notes ? `\nYour notes: ${spot.notes.pans} pan${spot.notes.pans === 1 ? '' : 's'}, ${(spot.notes.mg / spot.notes.pans).toFixed(1)} mg a pan.` : '';
    if (spot.gully) {
      const traced = spot.gully.traced ? '\nYou traced its colour upstream.' : '';
      this.tooltip.text = `Side gully: a dry wash comes down here. Test-pan its floor to see if colour comes from up there.${notes}${traced}\n${state} ${action}`;
    } else {
      const index = this.creek.creekSpots.indexOf(spot) + 1;
      const noticed = spot.signs.length ? spot.signs.map((s) => SIGN_NAMES[s]).join(', ') : 'nothing stands out';
      this.tooltip.text = `Spot ${index}: ${noticed}.${notes}\n${state} ${action}`;
    }
    const p = this.screenPosition(spot);
    const x = Math.min(p.x + 34, this.width_ - 280);
    const y = Math.max(8, p.y - 70);
    this.tooltip.position.set(x + 8, y + 6);
    this.tooltipBg.clear().roundRect(x, y, this.tooltip.width + 16, this.tooltip.height + 12, 4).fill({ color: 0x0c100b, alpha: 0.85 });
  }

  /** Phones held sideways: everything has to fit in a few hundred pixels of height. */
  private get short(): boolean {
    return this.height_ < 500;
  }

  /** The band the map is drawn in: below the hint and title, above the button bar. */
  private get band(): { top: number; bottom: number } {
    return this.short ? { top: 62, bottom: this.height_ - 58 } : { top: 90, bottom: this.height_ - 70 };
  }

  /** How far spots sit from the creek's centre line. */
  private get spotOffset(): number {
    const { top, bottom } = this.band;
    return Math.min(62, (bottom - top) * 0.22);
  }

  private creekY(x: number): number {
    const { top, bottom } = this.band;
    const mid = (top + bottom) / 2 - 17;
    const amplitude = Math.min(this.height_ * 0.15, (bottom - top) / 2 - this.spotOffset - 30);
    return mid + Math.sin((x / this.width_) * Math.PI * 2.2 + 0.4) * Math.max(0, amplitude);
  }

  /** Gullies alternate sides of the creek and run out to the edge of the view. */
  private gullyLine(spot: DigSpot): { mouth: { x: number; y: number }; end: { x: number; y: number } } {
    const x = this.width_ * (0.08 + 0.84 * spot.position);
    const up = this.creek.gullySpots.indexOf(spot) % 2 === 0;
    const centre = this.creekY(x) + 17;
    return {
      mouth: { x, y: up ? centre - 14 : centre + 14 },
      end: { x: x + 60, y: up ? this.band.top : this.band.bottom },
    };
  }

  /** Spots sit on the bank beside the channel; inside-bend spots sit on the inside of the curve. Gully spots sit up their gully. */
  screenPosition(spot: DigSpot): { x: number; y: number } {
    if (spot.gully) {
      const { mouth, end } = this.gullyLine(spot);
      const t = 0.55;
      // Point on the gully's curve (matching drawGully's control point).
      const cx = mouth.x + (end.x - mouth.x) * 0.2 - 30;
      const cy = (mouth.y + end.y) / 2;
      return {
        x: (1 - t) ** 2 * mouth.x + 2 * (1 - t) * t * cx + t ** 2 * end.x,
        y: (1 - t) ** 2 * mouth.y + 2 * (1 - t) * t * cy + t ** 2 * end.y,
      };
    }
    const x = this.width_ * (0.08 + 0.84 * spot.position);
    const k = (Math.PI * 2.2) / this.width_;
    const curvatureDown = -Math.sin(x * k + 0.4) > 0;
    const index = this.creek.creekSpots.indexOf(spot);
    const below = spot.signs.includes('insideBend') ? curvatureDown : index % 2 === 0;
    const centre = this.creekY(x) + 17;
    return { x, y: below ? centre + this.spotOffset : centre - this.spotOffset };
  }

  private spotAt(x: number, y: number): DigSpot | null {
    for (const spot of this.creek.spots) {
      const p = this.screenPosition(spot);
      if (Math.hypot(x - p.x, y - p.y) < 34) return spot;
    }
    return null;
  }
}

function reversePairs(points: number[]): number[] {
  const out: number[] = [];
  for (let i = points.length - 2; i >= 0; i -= 2) out.push(points[i] ?? 0, points[i + 1] ?? 0);
  return out;
}
