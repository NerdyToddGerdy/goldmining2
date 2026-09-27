import { ROCKER_TUNING, SLUICE_TUNING, type Pan, type PanControls, type PanStepEvents, type Rocker, type RockerStroke, type Sluice, type SluiceStepEvents } from '../sim';
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
          ? 'Gold is going over the lip. Black sand is heavy: tip the pan only slightly, and sift level now and then to settle it.'
          : 'Gold is going over the lip. Tip the pan less, or sift it level for a moment to settle it.',
      );
    } else if (!this.toldAboutClay && this.tippedWithClay > 2) {
      this.toldAboutClay = true;
      this.nudge('Nothing washes out while there is clay holding the gravel together. Keep sifting until the water clears.');
    } else if (!this.hasWashed && this.levelShaking > 3) {
      this.nudge(`The water's clear. Tip the pan toward the lip with ${tip} while you sift, and the light sand will wash over.`);
    } else if (!this.hasShaken && this.tippedStill > 3) {
      this.nudge(usingTouch() ? 'Hold the pan, or the Sift button, to sift it.' : 'Hold Space, or hold the pan with the mouse, to sift it.');
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
  private toldAboutSlope = false;
  private toldPumpDry = false;
  private toldPumpLow = false;
  private cooldown = 0;

  constructor(private readonly say: (message: string) => void) {}

  update(dt: number, sluice: Sluice, events: SluiceStepEvents | null): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recentGoldLost = this.recentGoldLost * Math.exp(-dt / 2) + (events?.goldLost ?? 0);
    this.backingUp = events?.state === 'underpowered' && sluice.headerVolume > 0.6 ? this.backingUp + dt : 0;
    // A fresh mat after cleanout earns a fresh reminder.
    if (sluice.mossLoading < 0.3) this.toldAboutMoss = false;
    const pump = sluice.usesPump ? sluice.kit.pump : null;
    if (pump && pump.fuel > SLUICE_TUNING.pumpTank * 0.5) this.toldPumpDry = this.toldPumpLow = false;
    if (this.cooldown > 0) return;
    const water = 'the Water slider';
    const slope = sluice.slopeState();
    const refuel = usingTouch() ? 'Refuel the pump' : 'Refuel the pump (G)';
    if (pump && pump.fuel <= 0 && !this.toldPumpDry) {
      this.toldPumpDry = true;
      this.nudge(`The pump has run dry and gone quiet. The creek alone is only a trickle here. ${refuel} to get the water back.`);
    } else if (pump && pump.fuel > 0 && pump.fuel < SLUICE_TUNING.pumpTank * 0.15 && !this.toldPumpLow) {
      this.toldPumpLow = true;
      this.nudge(`The pump is sputtering: its tank is nearly empty. ${refuel} before it stops.`);
    } else if (sluice.jammed) {
      this.nudge(usingTouch() ? 'The intake is jammed. Tap the header to rake it clear.' : 'The intake is jammed. Click the header, or press R, to rake it clear.');
    } else if (events?.state === 'overpowered' && this.recentGoldLost >= 2) {
      this.recentGoldLost = 0;
      this.nudge(`Whitewater is sweeping fine gold past the riffles. Close the intake a little with ${water}.`);
    } else if (this.backingUp > 3) {
      this.backingUp = 0;
      this.nudge(`Too little water for this much gravel: it's heaping at the header. Open the intake with ${water}, or shovel slower.`);
    } else if (!this.toldAboutSlope && slope !== 'good' && sluice.elapsed > 20) {
      this.toldAboutSlope = true;
      const fix = sluice.kit.legs ? 'Set it with the Slope slider.' : "The site's drop is what it is without adjustable legs.";
      this.nudge(
        slope === 'steep'
          ? `The box is steep: gravel shoots through before the gold can settle. ${fix}`
          : `The box is nearly flat: gravel piles up on the riffles and packs them. ${fix}`,
      );
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

/**
 * Nudges for the rocker box. Each names something the player can already see: a dry floor,
 * water slopping over the sides, sand spraying off the end, a dark apron, an empty bucket.
 */
export class RockerCoach {
  private cooldown = 0;
  private dryStrokes = 0;
  private quickStrokes = 0;
  private toldAboutApron = false;
  private toldAboutBucket = false;
  private toldAboutFlood = false;

  constructor(private readonly say: (message: string) => void) {}

  stroke(stroke: RockerStroke, rocker: Rocker): void {
    this.dryStrokes = rocker.water < ROCKER_TUNING.lowWater && rocker.hasLoad ? this.dryStrokes + 1 : 0;
    this.quickStrokes = stroke.state === 'sloshing' && rocker.water <= ROCKER_TUNING.floodFrom ? this.quickStrokes + 1 : 0;
    if (this.cooldown > 0) return;
    if (this.dryStrokes >= 3) {
      this.dryStrokes = 0;
      this.nudge(`The box is dry: nothing moves. ${usingTouch() ? 'Ladle' : 'Ladle (L)'} some water over the screen.`);
    } else if (this.quickStrokes >= 5) {
      this.quickStrokes = 0;
      this.nudge('Easy: rocking that fast throws everything out the end, gold too. Find a steady beat, about once a second.');
    }
  }

  update(dt: number, rocker: Rocker): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (rocker.apronLoading < 0.3) this.toldAboutApron = false;
    if (rocker.bucket > 0) this.toldAboutBucket = false;
    if (rocker.water < ROCKER_TUNING.floodFrom) this.toldAboutFlood = false;
    if (this.cooldown > 0) return;
    if (!this.toldAboutFlood && rocker.water > ROCKER_TUNING.floodFrom) {
      this.toldAboutFlood = true;
      this.nudge('Too much water: it is pouring over the sides and stripping the apron. Let it run down before ladling more.');
    } else if (!this.toldAboutApron && rocker.apronLoading > 0.8) {
      this.toldAboutApron = true;
      this.nudge(`The apron is dark and heavy. ${usingTouch() ? 'Clean it up' : 'Clean it up (C)'} soon: a loaded apron lets gold through.`);
    } else if (!this.toldAboutBucket && rocker.bucket === 0 && rocker.hasLoad) {
      this.toldAboutBucket = true;
      this.nudge(`The bucket is empty. ${usingTouch() ? 'Fetch water' : 'Fetch water (E)'} to keep rocking.`);
    }
  }

  private nudge(message: string): void {
    this.say(message);
    this.cooldown = 8;
  }
}
