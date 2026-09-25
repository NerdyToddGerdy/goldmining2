import type { Pan, PanControls, PanStepEvents, Sluice, SluiceStepEvents } from '../sim';
import { usingTouch } from './inputMode';

/**
 * Nudges a new player when the pan is being worked in a way that can't succeed: shaking it level
 * once the clay is gone (nothing can wash over the lip), tipping it without shaking, tipping while
 * clay still holds everything, revealing before the sand is worked down, or washing on after it is.
 * The learning nudges stop once the player has shown they've got it.
 */
export class PanCoach {
  private levelShaking = 0;
  private tippedStill = 0;
  private tippedWithClay = 0;
  private overworking = 0;
  /** Gold pieces lost over the lip recently, decaying over a couple of seconds. */
  private recentGoldLost = 0;
  private hasWashed = false;
  private hasShaken = false;
  private toldAboutClay = false;
  private cooldown = 0;
  private revealWarnedAt = -Infinity;
  private time = 0;

  constructor(private readonly say: (message: string) => void) {}

  update(dt: number, pan: Pan, controls: PanControls, events: PanStepEvents | null): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recentGoldLost = this.recentGoldLost * Math.exp(-dt / 2) + (events?.goldLost ?? 0);
    if (pan.phase !== 'working') return;

    const shaking = controls.shake > 0;
    const tipped = controls.tilt > 0.1;
    const clay = pan.clay > 0;
    if (shaking) this.hasShaken = true;
    if (shaking && tipped && !clay) this.hasWashed = true;

    this.levelShaking = shaking && !clay && controls.tilt < 0.08 ? this.levelShaking + dt : 0;
    this.tippedStill = tipped && !shaking && !clay ? this.tippedStill + dt : 0;
    this.tippedWithClay = tipped && shaking && clay ? this.tippedWithClay + dt : 0;
    this.overworking = pan.workedDown && shaking && controls.tilt > 0.05 ? this.overworking + dt : 0;

    if (this.cooldown > 0) return;
    const tip = usingTouch() ? 'the Tilt slider' : 'W, the mouse wheel, or the Tilt slider';
    // Always shown, however experienced: overworking is expensive and easy to miss.
    if (this.overworking > 1.5) {
      this.nudge("You're down to the concentrate. Stop and reveal before the gold washes out with it.");
    } else if (this.recentGoldLost >= 2) {
      // Always shown: sparks at the lip are easy to miss, and every one is gold gone for good.
      this.recentGoldLost = 0;
      this.nudge(
        pan.kind === 'concentrate'
          ? 'Gold is going over the lip. Black sand is heavy: tip the pan only slightly, and shake level now and then to settle it.'
          : 'Gold is going over the lip. Tip the pan less, or shake it level for a moment to settle it.',
      );
    } else if (!this.toldAboutClay && this.tippedWithClay > 2) {
      this.toldAboutClay = true;
      this.nudge('Nothing washes out while there is clay holding the gravel together. Keep shaking until the water clears.');
    } else if (!this.hasWashed && this.levelShaking > 3) {
      this.nudge(`The water's clear. Tip the pan toward the lip with ${tip} while you shake, and the light sand will wash over.`);
    } else if (!this.hasShaken && this.tippedStill > 3) {
      this.nudge(usingTouch() ? 'Hold the pan, or the Shake button, to shake it.' : 'Hold Space, or hold the pan with the mouse, to shake it.');
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

/**
 * Nudges for running the sluice: the machine shows each of these physically first (gravel
 * heaping at the header, whitewater, a dark heavy mat); the nudge names what the player is seeing.
 */
export class SluiceCoach {
  private backingUp = 0;
  private recentGoldLost = 0;
  private toldAboutMoss = false;
  private cooldown = 0;

  constructor(private readonly say: (message: string) => void) {}

  update(dt: number, sluice: Sluice, events: SluiceStepEvents | null): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recentGoldLost = this.recentGoldLost * Math.exp(-dt / 2) + (events?.goldLost ?? 0);
    this.backingUp = events?.state === 'underpowered' && sluice.headerVolume > 0.6 ? this.backingUp + dt : 0;
    // A fresh mat after cleanout earns a fresh reminder.
    if (sluice.mossLoading < 0.3) this.toldAboutMoss = false;
    if (this.cooldown > 0) return;
    const water = 'the Water slider';
    if (sluice.jammed) {
      this.nudge(usingTouch() ? 'The intake is jammed. Tap the header to rake it clear.' : 'The intake is jammed. Click the header, or press R, to rake it clear.');
    } else if (events?.state === 'overpowered' && this.recentGoldLost >= 2) {
      this.recentGoldLost = 0;
      this.nudge(`Whitewater is sweeping fine gold past the riffles. Close the intake a little with ${water}.`);
    } else if (this.backingUp > 3) {
      this.backingUp = 0;
      this.nudge(`Too little water for this much gravel: it's heaping at the header. Open the intake with ${water}, or shovel slower.`);
    } else if (!this.toldAboutMoss && sluice.mossLoading > 0.8) {
      this.toldAboutMoss = true;
      this.nudge('The moss is dark and heavy with concentrate. Clean it out soon: a full mat lets gold through.');
    }
  }

  private nudge(message: string): void {
    this.say(message);
    this.cooldown = 8;
  }
}
