import type { PanControls } from '../sim';
import { SloshTracker } from './sloshTracker';

const TILT_KEY_RATE = 0.9;

/**
 * Turns mouse, touch, and keyboard into pan controls.
 * Slosh: drag back and forth toward and away from the lip. Tilt: W/S, arrow keys, mouse wheel,
 * or the slider. Shake: hold Space or the shake button.
 */
export class PanInput {
  tilt = 0;
  slosh = 0;
  /** Where the water is being pushed: -1 away from the lip, +1 toward it. For drawing the surge. */
  sloshOffset = 0;
  shakeHeld = false;
  /** Only the pan screen listens; other screens handle their own pointer input. */
  enabled = false;

  private readonly tracker = new SloshTracker();
  /** The finger or mouse doing the sloshing; a second finger on the slider or Shake is ignored here. */
  private pointerId: number | null = null;
  private downAt: { x: number; y: number } | null = null;
  private readonly keys = new Set<string>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly panRadius: () => number,
    private readonly onTap: (x: number, y: number) => void,
  ) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointermove', this.handleMove);
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.shakeHeld = false;
    });
  }

  /** Advance smoothing and return this frame's controls. */
  sample(dt: number): PanControls {
    if (this.keys.has('w') || this.keys.has('arrowup')) this.tilt += TILT_KEY_RATE * dt;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.tilt -= TILT_KEY_RATE * dt;
    this.tilt = clamp01(this.tilt);

    const { slosh, offset } = this.tracker.sample(dt, this.panRadius());
    this.slosh = slosh;
    this.sloshOffset = offset;
    return { tilt: this.tilt, slosh, shake: this.shakeHeld || this.keys.has(' ') ? 1 : 0 };
  }

  private readonly handleDown = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.downAt = { x: e.clientX, y: e.clientY };
    this.tracker.start(e.clientX);
  };

  private readonly handleMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.tracker.move(e.clientX, this.panRadius());
  };

  private readonly handleUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 8) {
      const rect = this.canvas.getBoundingClientRect();
      this.onTap(e.clientX - rect.left, e.clientY - rect.top);
    }
    this.pointerId = null;
    this.downAt = null;
    this.tracker.end();
  };

  private readonly handleWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.tilt = clamp01(this.tilt - e.deltaY * 0.0015);
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    const key = e.key.toLowerCase();
    if (key === ' ' || key.startsWith('arrow')) e.preventDefault();
    this.keys.add(key);
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
