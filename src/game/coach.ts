import type { Pan, PanControls } from '../sim';
import { usingTouch } from './inputMode';

/**
 * Nudges a new player when the pan is being worked in a way that can't succeed, e.g. sloshing
 * a level pan (nothing can wash over the lip), revealing before the sand is worked down, or
 * sloshing on after it is. The learning nudges stop once the player has shown they've got it.
 */
export class PanCoach {
  private sloshLevel = 0;
  private tiltStill = 0;
  private overworking = 0;
  private hasWashed = false;
  private hasSloshed = false;
  private cooldown = 0;
  private revealWarnedAt = -Infinity;
  private time = 0;

  constructor(private readonly say: (message: string) => void) {}

  update(dt: number, pan: Pan, controls: PanControls): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (pan.phase !== 'working') return;

    if (controls.slosh > 0.2 && controls.tilt > 0.1) this.hasWashed = true;
    if (controls.slosh > 0.2) this.hasSloshed = true;

    this.sloshLevel = controls.slosh > 0.2 && controls.tilt < 0.08 ? this.sloshLevel + dt : 0;
    this.overworking = pan.workedDown && controls.slosh > 0.2 && controls.tilt > 0.05 ? this.overworking + dt : 0;
    this.tiltStill = controls.tilt > 0.1 && controls.slosh < 0.05 && controls.shake === 0 ? this.tiltStill + dt : 0;

    if (this.cooldown > 0) return;
    // Always shown, however experienced: overworking is expensive and easy to miss.
    if (this.overworking > 1.5) {
      this.nudge("You're down to the concentrate. Stop and reveal before the gold washes out with it.");
    } else if (!this.hasWashed && this.sloshLevel > 2) {
      this.nudge(
        usingTouch()
          ? 'The pan is level, so nothing can wash out. Tip it toward the lip with the Tilt slider.'
          : 'The pan is level, so nothing can wash out. Tip it toward the lip with W, the mouse wheel, or the Tilt slider.',
      );
    } else if (!this.hasSloshed && this.tiltStill > 3) {
      this.nudge('Drag back and forth toward the lip to slosh the water and carry the light sand over.');
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
    this.say(`About ${Math.round(sandLeft * 100)}% of the sand is still in the pan and will hide the gold. Keep washing, or ${usingTouch() ? 'tap Stop & reveal' : 'press R'} again to reveal anyway.`);
    return false;
  }

  private nudge(message: string): void {
    this.say(message);
    this.cooldown = 8;
  }
}
