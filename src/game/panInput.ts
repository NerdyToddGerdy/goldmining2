import type { PanControls } from '../sim';

const FULL_SWIRL_RAD_PER_SEC = Math.PI * 2 * 1.5;
const TILT_KEY_RATE = 0.9;

/**
 * Turns mouse, touch, and keyboard into pan controls.
 * Swirl: drag in circles around the pan. Tilt: W/S, arrow keys, mouse wheel, or the slider.
 * Shake: hold Space or the shake button.
 */
export class PanInput {
  tilt = 0;
  swirl = 0;
  /** +1 counter-clockwise, -1 clockwise, following the last drag. */
  swirlDirection = 1;
  shakeHeld = false;
  /** Only the pan screen listens; other screens handle their own pointer input. */
  enabled = false;

  private pointerDown = false;
  private lastAngle: number | null = null;
  private pendingRadians = 0;
  private downAt: { x: number; y: number } | null = null;
  private readonly keys = new Set<string>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly panCenter: () => { x: number; y: number },
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

    const target = dt > 0 ? Math.min(1, Math.abs(this.pendingRadians / dt) / FULL_SWIRL_RAD_PER_SEC) : 0;
    if (this.pendingRadians !== 0) this.swirlDirection = Math.sign(this.pendingRadians);
    this.pendingRadians = 0;
    // Rise quickly with the hand, settle more slowly as the water keeps turning.
    const rate = target > this.swirl ? 10 : 2.5;
    this.swirl += (target - this.swirl) * Math.min(1, dt * rate);

    return { tilt: this.tilt, swirl: this.swirl, shake: this.shakeHeld || this.keys.has(' ') ? 1 : 0 };
  }

  private readonly handleDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointerDown = true;
    this.lastAngle = this.angleOf(e);
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private readonly handleMove = (e: PointerEvent): void => {
    if (!this.pointerDown || this.lastAngle === null) return;
    const angle = this.angleOf(e);
    let delta = angle - this.lastAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.pendingRadians += delta;
    this.lastAngle = angle;
  };

  private readonly handleUp = (e: PointerEvent): void => {
    if (this.pointerDown && this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 8) {
      const rect = this.canvas.getBoundingClientRect();
      this.onTap(e.clientX - rect.left, e.clientY - rect.top);
    }
    this.pointerDown = false;
    this.lastAngle = null;
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

  private angleOf(e: PointerEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    const center = this.panCenter();
    // Screen y points down; negate so counter-clockwise drags are positive.
    return Math.atan2(-(e.clientY - rect.top - center.y), e.clientX - rect.left - center.x);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
