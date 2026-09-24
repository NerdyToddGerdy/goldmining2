import type { Pan, PanControls } from '../sim';

/**
 * Nudges a new player when the pan is being worked in a way that can't succeed, e.g. swirling
 * a level pan (nothing can wash over the lip) or revealing before the sand is worked down.
 * Each nudge stops once the player has shown they've got it.
 */
export class PanCoach {
  private swirlLevel = 0;
  private tiltStill = 0;
  private hasWashed = false;
  private hasSwirled = false;
  private cooldown = 0;
  private revealWarnedAt = -Infinity;
  private time = 0;

  constructor(private readonly say: (message: string) => void) {}

  update(dt: number, pan: Pan, controls: PanControls): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (pan.phase !== 'working') return;

    if (controls.swirl > 0.2 && controls.tilt > 0.1) this.hasWashed = true;
    if (controls.swirl > 0.2) this.hasSwirled = true;

    this.swirlLevel = controls.swirl > 0.2 && controls.tilt < 0.08 ? this.swirlLevel + dt : 0;
    this.tiltStill = controls.tilt > 0.1 && controls.swirl < 0.05 && controls.shake === 0 ? this.tiltStill + dt : 0;

    if (this.cooldown > 0) return;
    if (!this.hasWashed && this.swirlLevel > 2) {
      this.nudge('The pan is level, so nothing can wash out. Tip it toward the lip with W, the mouse wheel, or the Tilt slider.');
    } else if (!this.hasSwirled && this.tiltStill > 3) {
      this.nudge('Drag in circles around the pan to swirl the water and carry the light sand over the lip.');
    }
  }

  /**
   * Returns false (and warns) the first time the player tries to reveal a pan that still holds
   * most of its sand, since the sand will hide the gold. A second try within a few seconds goes through.
   */
  allowReveal(pan: Pan): boolean {
    const sandLeft = pan.lightSand / pan.initialLightSand;
    if (sandLeft < 0.4 || this.time - this.revealWarnedAt < 5) return true;
    this.revealWarnedAt = this.time;
    this.say(`About ${Math.round(sandLeft * 100)}% of the sand is still in the pan and will hide the gold. Keep washing, or press R again to reveal anyway.`);
    return false;
  }

  private nudge(message: string): void {
    this.say(message);
    this.cooldown = 8;
  }
}
