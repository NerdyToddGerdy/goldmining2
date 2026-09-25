import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { CLASSIFIER_TUNING, type Classifier } from '../sim';

/**
 * Close-up of the hand classifier: a screen over a bucket. Hold to sift: the tray rocks, the
 * gravel jostles, and sand and fines rain through the mesh into the bucket. Rocks stay on top
 * (tap one to pick it off and look it over for a wedged picker); on the fine screen, pebbles
 * stay too. The more oversize on the mesh, the slower it passes.
 */

export interface ClassifierActions {
  /** A rock was tapped: pick it off and inspect it. */
  inspectRock(rockId: number): void;
}

const COLORS = {
  bank: 0x5b5236,
  frame: 0x6b5033,
  frameDark: 0x3d2c1c,
  mesh: 0x2c2a26,
  bucket: 0x7a7f86,
  bucketDark: 0x4d5258,
  fill: 0x8b7a5a,
  rock: [0x7c786f, 0x8d8a80, 0x6a665e],
  pebble: 0x9a9486,
  sand: [0xc8b891, 0xb3a37e, 0xd6c9a4, 0x2a2622],
} as const;

interface Falling {
  x: number;
  y: number;
  vy: number;
  color: number;
}

export class ClassifierView extends Container {
  private readonly g = new Graphics();
  private width_ = 800;
  private height_ = 600;
  private time = 0;
  private sway = 0;
  private falling: Falling[] = [];
  private fallCarry = 0;
  private classifier: Classifier | null = null;

  constructor(private readonly actions: ClassifierActions) {
    super();
    this.addChild(this.g);
    this.eventMode = 'static';
    this.on('pointertap', (e: FederatedPointerEvent) => {
      const rock = this.rockAt(e.global.x, e.global.y);
      if (rock !== null) this.actions.inspectRock(rock);
    });
  }

  layout(width: number, height: number): void {
    this.width_ = width;
    this.height_ = height;
    this.hitArea = new Rectangle(0, 0, width, height);
  }

  update(dt: number, classifier: Classifier, shaking: boolean, passed: number): void {
    this.classifier = classifier;
    this.time += dt;
    this.sway = shaking && classifier.hasLoad ? Math.sin(this.time * Math.PI * 2 * 4) * 10 : this.sway * 0.8;

    // Material that passed this frame rains down from the mesh into the bucket.
    this.fallCarry += passed / 0.004;
    const tray = this.trayRect();
    const bucket = this.bucketRect();
    while (this.fallCarry >= 1) {
      this.fallCarry -= 1;
      // Fines fall straight down into the bucket's mouth, which is narrower than the tray.
      this.falling.push({
        x: bucket.x + 10 + Math.random() * (bucket.w - 20),
        y: tray.y + tray.h,
        vy: 60 + Math.random() * 60,
        color: COLORS.sand[Math.floor(Math.random() * COLORS.sand.length)]!,
      });
    }
    const floor = this.bucketFillY(classifier);
    for (const f of this.falling) {
      f.vy += 900 * dt;
      f.y += f.vy * dt;
    }
    this.falling = this.falling.filter((f) => f.y < floor).slice(-300);
    this.draw(classifier, shaking);
  }

  // ---- geometry ----

  private trayRect(): { x: number; y: number; w: number; h: number } {
    const w = Math.min(this.width_ * 0.5, 460);
    return { x: (this.width_ - w) / 2, y: this.height_ * 0.28, w, h: 30 };
  }

  private bucketRect(): { x: number; y: number; w: number; h: number } {
    const tray = this.trayRect();
    const w = tray.w * 0.72;
    return { x: (this.width_ - w) / 2, y: tray.y + tray.h + 6, w, h: Math.min(this.height_ * 0.4, 230) };
  }

  private bucketFillY(classifier: Classifier): number {
    const b = this.bucketRect();
    const fill = Math.min(1, classifier.bucketVolume / CLASSIFIER_TUNING.bucketCapacity);
    return b.y + b.h - (b.h - 8) * fill;
  }

  /** Rocks sit at fixed spots on the tray, placed from their ids. */
  private rockPos(id: number, i: number): { x: number; y: number; r: number } {
    const tray = this.trayRect();
    const u = ((id * 0.618034) % 1 + i * 0.13) % 1;
    return { x: tray.x + 24 + u * (tray.w - 48) + this.sway, y: tray.y - 8 - ((id * 7) % 3) * 5, r: 10 + (id % 3) * 3 };
  }

  private rockAt(x: number, y: number): number | null {
    const rocks = this.classifier?.rocks ?? [];
    for (let i = rocks.length - 1; i >= 0; i--) {
      const rock = rocks[i]!;
      const p = this.rockPos(rock.id, i);
      if (Math.hypot(x - p.x, y - p.y) < p.r + 10) return rock.id;
    }
    return null;
  }

  // ---- drawing ----

  private draw(classifier: Classifier, shaking: boolean): void {
    const g = this.g.clear();
    const W = this.width_;
    const H = this.height_;
    g.rect(0, 0, W, H).fill(COLORS.bank);
    g.rect(0, H * 0.82, W, H * 0.18).fill(0x4d4530);

    // Bucket and its fill.
    const b = this.bucketRect();
    const inset = b.w * 0.1;
    g.poly([b.x, b.y, b.x + b.w, b.y, b.x + b.w - inset, b.y + b.h, b.x + inset, b.y + b.h]).fill(COLORS.bucket).stroke({ width: 3, color: COLORS.bucketDark });
    const fillY = this.bucketFillY(classifier);
    if (classifier.bucketVolume > 0.005) {
      const t = (fillY - b.y) / b.h;
      g.poly([b.x + inset * t + 3, fillY, b.x + b.w - inset * t - 3, fillY, b.x + b.w - inset - 3, b.y + b.h - 3, b.x + inset + 3, b.y + b.h - 3]).fill(COLORS.fill);
      for (let i = 0; i < 40; i++) {
        const u = (i * 0.618) % 1;
        const v = (i * 0.37) % 1;
        const y = fillY + 4 + v * Math.max(0, b.y + b.h - fillY - 10);
        g.circle(b.x + inset + 6 + u * (b.w - 2 * inset - 12), y, 1.4).fill(i % 5 === 0 ? 0x2a2622 : 0xb3a37e);
      }
    }
    for (const f of this.falling) g.circle(f.x, f.y, 1.6).fill(f.color);

    // Tray, mesh, and what sits on it.
    const tray = this.trayRect();
    const x = tray.x + this.sway;
    const hold = classifier.passable;
    // Blinded mesh shows darker: oversize packed into the openings.
    const blind = classifier.blinding;
    g.rect(x, tray.y, tray.w, tray.h).fill({ color: 0x2c2a26, alpha: 0.35 + blind * 0.5 });
    const step = classifier.screen === 'fine' ? 7 : 16;
    for (let mx = x + step; mx < x + tray.w; mx += step) g.moveTo(mx, tray.y).lineTo(mx, tray.y + tray.h);
    for (let my = tray.y + step / 2; my < tray.y + tray.h; my += step) g.moveTo(x, my).lineTo(x + tray.w, my);
    g.stroke({ width: 1, color: COLORS.mesh, alpha: 0.9 });
    g.rect(x - 6, tray.y - 4, tray.w + 12, tray.h + 8).stroke({ width: 6, color: COLORS.frame });

    if (hold > 0.005) {
      // The heap still to go through, jostling while sifted.
      const heap = Math.min(1, hold / 0.8);
      const n = Math.round(120 * heap);
      for (let i = 0; i < n; i++) {
        const u = (i * 0.618034) % 1;
        const jitter = shaking ? Math.sin(this.time * 30 + i) * 2 : 0;
        const px = x + 14 + u * (tray.w - 28) + jitter;
        const py = tray.y - 2 - ((i * 0.37) % 1) * 22 * heap;
        g.circle(px, py, 2.2).fill(COLORS.sand[i % COLORS.sand.length]!);
      }
    }
    // Pebbles held on a fine screen.
    const pebbles = Math.round(classifier.pebbles * 60);
    for (let i = 0; i < pebbles; i++) {
      const u = (i * 0.4142) % 1;
      g.circle(x + 16 + u * (tray.w - 32), tray.y - 3 - (i % 3) * 3, 3.2).fill(COLORS.pebble);
    }
    classifier.rocks.forEach((rock, i) => {
      const p = this.rockPos(rock.id, i);
      g.circle(p.x, p.y, p.r).fill(COLORS.rock[rock.id % COLORS.rock.length]!).stroke({ width: 1.5, color: 0x3c3a35 });
    });
  }
}
