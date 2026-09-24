/**
 * Turns a back-and-forth drag toward and away from the pan's lip into slosh. Only horizontal
 * motion counts, since the lip is on the right. Slosh is hand speed, scaled to the pan's size,
 * but only while the hand keeps changing direction: one long drag or a still hand is not sloshing.
 * DOM-free so it can be tested directly.
 */

/** Pan radii per second of hand travel for full slosh (e.g. strokes of ±half a radius at 2 Hz). */
const FULL_SLOSH_RADII_PER_SEC = 4;
/** Sloshing counts only this long after the last reversal (or the start of a drag). */
const REVERSAL_WINDOW = 0.6;
/** A direction change must follow at least this much travel (in pan radii) to count; smaller is jitter. */
const MIN_STROKE_RADII = 0.08;

export interface SloshSample {
  /** 0 = still, 1 = full slosh. */
  readonly slosh: number;
  /** Where the hand is relative to where it has been sloshing around: -1 away from the lip, +1 toward it. */
  readonly offset: number;
}

export class SloshTracker {
  private active = false;
  private x = 0;
  private centre = 0;
  private time = 0;
  private gateUntil = -Infinity;
  private direction = 0;
  private strokeStart = 0;
  private pendingTravel = 0;
  private slosh = 0;
  private offset = 0;

  start(x: number): void {
    this.active = true;
    this.x = x;
    this.centre = x;
    this.direction = 0;
    this.strokeStart = x;
    this.pendingTravel = 0;
    // The first stroke of a drag counts before any reversal has happened.
    this.gateUntil = this.time + REVERSAL_WINDOW;
  }

  /** `radius` is the pan's radius in the same units as x. */
  move(x: number, radius: number): void {
    if (!this.active) return;
    const dx = x - this.x;
    this.x = x;
    if (dx === 0) return;
    this.pendingTravel += Math.abs(dx);
    const direction = Math.sign(dx);
    if (direction !== this.direction) {
      // A reversal only counts if the stroke before it was a real stroke, not a twitch.
      if (this.direction !== 0 && Math.abs(x - dx - this.strokeStart) >= MIN_STROKE_RADII * radius) {
        this.gateUntil = this.time + REVERSAL_WINDOW;
      }
      this.direction = direction;
      this.strokeStart = x - dx;
    }
  }

  end(): void {
    this.active = false;
  }

  sample(dt: number, radius: number): SloshSample {
    this.time += dt;
    const gated = this.active && this.time <= this.gateUntil;
    const speed = dt > 0 ? this.pendingTravel / dt / radius : 0;
    this.pendingTravel = 0;
    const target = gated ? Math.min(1, speed / FULL_SLOSH_RADII_PER_SEC) : 0;
    // Rise quickly with the hand, settle more slowly as the water keeps moving.
    const rate = target > this.slosh ? 10 : 2.5;
    this.slosh += (target - this.slosh) * Math.min(1, dt * rate);

    if (this.active) this.centre += (this.x - this.centre) * Math.min(1, dt * 2);
    const targetOffset = this.active ? clamp((this.x - this.centre) / radius, -1, 1) : 0;
    this.offset += (targetOffset - this.offset) * Math.min(1, dt * 12);
    return { slosh: this.slosh, offset: this.offset };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
