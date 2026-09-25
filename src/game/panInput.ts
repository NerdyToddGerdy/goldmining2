import type { PanControls } from '../sim';

const TILT_KEY_RATE = 0.9;

/**
 * Turns mouse, touch, and keyboard into pan controls.
 * Shake: hold the pan (mouse or finger), Space, or the Shake button. Tilt: W/S, arrow keys, mouse
 * wheel, or the slider. A quick tap on a rock rakes it out instead.
 */
export class PanInput {
  tilt = 0;
  shakeHeld = false;
  /** Only the pan screen listens; other screens handle their own pointer input. */
  enabled = false;

  /** The finger or mouse holding the pan; a second finger on the slider or Shake is ignored here. */
  private pointerId: number | null = null;
  private downAt: { x: number; y: number } | null = null;
  private readonly keys = new Set<string>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onTap: (x: number, y: number) => void,
  ) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.shakeHeld = false;
      this.pointerId = null;
    });
  }

  /** Advance key-driven tilt and return this frame's controls. */
  sample(dt: number): PanControls {
    if (this.keys.has('w') || this.keys.has('arrowup')) this.tilt += TILT_KEY_RATE * dt;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.tilt -= TILT_KEY_RATE * dt;
    this.tilt = clamp01(this.tilt);
    const shaking = this.shakeHeld || this.keys.has(' ') || this.pointerId !== null;
    return { tilt: this.tilt, shake: shaking ? 1 : 0 };
  }

  private readonly handleDown = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private readonly handleUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 8) {
      const rect = this.canvas.getBoundingClientRect();
      this.onTap(e.clientX - rect.left, e.clientY - rect.top);
    }
    this.pointerId = null;
    this.downAt = null;
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
