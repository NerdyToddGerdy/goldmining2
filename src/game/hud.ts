import {
  ECONOMY_TUNING,
  STAFF_TUNING,
  JOB_KINDS,
  TOWN_JOBS,
  TOWN_SITE,
  CREW_POLICIES,
  DIGGING_JOBS,
  type CrewPolicy,
  crewGroundLeft,
  estimateHandTake,
  jobFits,
  traitsOf,
  type Crew,
  type CrewMachine,
  type JobIdle,
  type JobKind,
  type Role,
  wearWord,
  WEAR_TUNING,
  REPAIR_KIT,
  type Skill,
  type Pace,
  type FinancialState,
  type SiteKind,
  claimOverview,
  costOverview,
  STATUS_ORDER,
  type ClaimHealth,
  type ClaimOverview,
  OPERATOR_JOBS,
  type Economy,
  FUEL_CAN,
  MAGNET_TUNING,
  MIN_CONCENTRATE,
  OUTFITTER,
  ROCKER_TUNING,
  HIGHBANKER_TUNING,
  TROMMEL_TUNING,
  type Trommel,
  type TrommelStepEvents,
  siteAllows,
  type Rocker,
  type Highbanker,
  type HighbankerStepEvents,
  type Drywasher,
  type DrywasherStepEvents,
  type WashTub,
  DRYWASHER_TUNING,
  SLUICE_TUNING,
  quoteSale,
  type GearId,
  type DigSpot,
  type GoldPiece,
  type Creek,
  type PanControls,
  type PanStepEvents,
  type PanningSession,
  type Lead,
  type LeadSource,
  type Region,
  type Classifier,
  type Sluice,
  type SluiceStepEvents,
} from '../sim';
import { forInput, usingTouch } from './inputMode';

export type Mode = 'creek' | 'bank' | 'pan' | 'town' | 'region' | 'sluice' | 'classifier' | 'magnet' | 'rocker' | 'highbanker' | 'drywasher' | 'trommel';

export interface HudActions {
  // Pan
  reveal(): void;
  collect(saveBlackSand: boolean): void;
  backToHole(): void;
  /** Zoom the region map in (>1) or out (<1); 0 fits it all back in view. */
  zoomMap(factor: number): void;
  /** Service the machine in the close-up with a repair kit. */
  serviceMachine(): void;
  buyRepairKit(): void;
  /** Pour the jar into the settling tub in town, and collect gold waiting at the counter. */
  leaveJar(): void;
  collectCounter(): void;
  /** Snuff at the next point along the tail (keyboard and button). */
  snuff(): void;
  panConcentrate(): void;
  setTilt(tilt: number): void;
  setShake(held: boolean): void;
  // Creek
  pickSpot(index: number): void;
  /** Dig at the spot selected by tapping (touch has no hover to preview spots). */
  digSelected(): void;
  // Bank
  shovel(into: 'pan' | 'spoil' | 'sluice' | 'classifier' | 'rocker' | 'highbanker' | 'drywasher' | 'trommel'): void;
  openClassifier(): void;
  // Classifier
  swapScreen(): void;
  tipOff(): void;
  panBucket(): void;
  pourIntoSluice(): void;
  setUpSluice(): void;
  openSluice(): void;
  // Sluice
  setWater(flow: number): void;
  setSlope(slope: number): void;
  refuelPump(): void;
  rakeSluice(): void;
  startCleanout(): void;
  liftMat(): void;
  cancelCleanout(): void;
  takeDownSluice(): void;
  pry(): void;
  bail(): void;
  walkCreek(): void;
  newCreek(): void;
  walkToTown(): void;
  openRegion(): void;
  // Town
  sell(): void;
  buyLead(leadId: number): void;
  buyGear(id: GearId): void;
  buyFuel(): void;
  hireApplicant(applicantId: number): void;
  dismissHand(workerId: number): void;
  sendHand(creekId: number, role: Role): void;
  recallHand(creekId: number): void;
  toggleJob(creekId: number, job: JobKind): void;
  setPolicy(creekId: number, policy: CrewPolicy): void;
  buyCrewMachine(machine: CrewMachine): void;
  washReturned(): void;
  releaseClaim(creekId: number): void;
  /** From the field tablet: walk straight to a claim. */
  goToClaim(creekId: number): void;
  restakeClaim(creekId: number): void;
  collectCrew(): void;
  // Highbanker
  openHighbanker(): void;
  setUpHighbanker(): void;
  // Trommel
  openTrommel(): void;
  setUpTrommel(): void;
  takeDownTrommel(): void;
  toggleTrommel(): void;
  clearTrommel(): void;
  refuelTrommel(): void;
  trommelCleanout(): void;
  cancelTrommelCleanout(): void;
  liftTrommelMat(): void;
  takeDownHighbanker(): void;
  primePump(): void;
  toggleEngine(): void;
  clearHighbanker(): void;
  refuelHighbanker(): void;
  highbankerCleanout(): void;
  cancelHighbankerCleanout(): void;
  liftHighbankerMat(): void;
  pourIntoHighbanker(): void;
  // Dry gear
  openDrywasher(): void;
  knockScreen(): void;
  shakeOutDust(): void;
  tipDrywasher(): void;
  pullDrawer(): void;
  pourIntoDrywasher(): void;
  changeTubWater(): void;
  // Rocker
  openRocker(): void;
  rock(): void;
  ladle(): void;
  fetchWater(): void;
  tipRocker(): void;
  cleanUpRocker(): void;
  pourIntoRocker(): void;
  // Magnet
  openMagnet(): void;
  shakeClump(): void;
  stripClump(): void;
  closeMagnet(): void;
  // Region
  followLead(leadId: number): void;
}

export interface HudState {
  readonly mode: Mode;
  readonly session: PanningSession;
  readonly region: Region;
  readonly creek: Creek;
  readonly spot: DigSpot | null;
  /** On the creek map, the spot tapped once to see its signs. */
  readonly selectedSpot: DigSpot | null;
  readonly controls: PanControls;
  readonly events: PanStepEvents | null;
  /** The sluice set up at the current spot, if any, with its last step and intake setting. */
  readonly sluice: Sluice | null;
  readonly sluiceEvents: SluiceStepEvents | null;
  readonly sluiceFlow: number;
  /** The highbanker set up at the current spot, if any, its last step, throttle, and a prime under way. */
  readonly highbanker: Highbanker | null;
  readonly highbankerEvents: HighbankerStepEvents | null;
  /** The trommel set up at this spot, its last step, and its drum speed and spray. */
  readonly trommel: Trommel | null;
  readonly trommelEvents: TrommelStepEvents | null;
  readonly drumSpeed: number;
  readonly spray: number;
  readonly throttle: number;
  readonly priming: boolean;
  /** Dry gear, when the player has it and the ground is dry. */
  readonly drywasher: Drywasher | null;
  readonly drywasherEvents: DrywasherStepEvents | null;
  readonly tub: WashTub | null;
  /** Off hauling water for the tub. */
  readonly tubFetching: boolean;
  /** A cleanout is under way: feeding stopped, clean water rinsing the riffles. */
  readonly cleaningOut: boolean;
  /** The classifier, when the player has one and this creek allows it (never the Home Creek). */
  readonly classifier: Classifier | null;
  /** The rocker box, when the player has one and this creek allows it (never the Home Creek). */
  readonly rocker: Rocker | null;
  /** Off fetching a bucket of water for the rocker. */
  readonly fetchingWater: boolean;
  /** Panning at the wash trough in town rather than at a creek. */
  readonly panInTown: boolean;
  /** The pan is revealed and the snuffer bottle can be used here. */
  readonly canSnuff: boolean;
  /** There is water here to pan in (not at a dry wash). */
  readonly canPan: boolean;
  readonly economy: Economy;
  readonly crew: Crew;
  /** The books: financial state, the countdown to shutdown, and what's allowed. */
  readonly money: {
    readonly state: FinancialState;
    readonly daysToShutdown: number | null;
    readonly owed: number;
    readonly canHire: boolean;
    readonly canCrewGear: boolean;
    readonly canRestake: boolean;
  };
}

const JOB_NAMES: Record<JobKind, string> = {
  sluice: 'Sluice',
  highbanker: 'Highbanker',
  trommel: 'Trommel',
  rocker: 'Rocker',
  drywasher: 'Drywasher',
  pan: 'Pan',
  screen: 'Screen loads',
  haul: 'Haul',
  prospect: 'Prospect',
  finish: 'Finish concentrate',
  courier: 'Run to town',
  magnet: 'Magnet the tub',
};

const IDLE_WORDS: Record<JobIdle, string> = {
  noMachine: 'needs a crew unit (outfitter)',
  noSite: 'no free spot for it',
  noWater: 'no water here',
  workedOut: 'ground worked out',
  bucketFull: 'crew bucket full: collect it',
  noFuel: 'out of fuel cans',
  nothingToFinish: 'nothing to finish yet',
  groundReady: 'ground prepared: pay gravel open',
  needsService: 'engine seized: needs a repair kit',
};

const ROLE_WORDS: Record<Role, string> = { hand: 'hand', operator: 'operator', foreman: 'foreman' };
const SKILL_WORDS: Record<Skill, string> = { green: 'green', fair: 'fair hand', seasoned: 'seasoned' };
const PACE_WORDS: Record<Pace, string> = { slow: 'slow', steady: 'steady', quick: 'quick' };

/** A worker as the player reads them: name, role, and what sort of worker they are. */
function workerWords(w: { readonly name: string; readonly role: Role; readonly skill: Skill; readonly pace: Pace }): string {
  return `${w.name} (${ROLE_WORDS[w.role]}, ${w.skill === 'fair' ? '' : `${SKILL_WORDS[w.skill]}, `}${PACE_WORDS[w.pace]})`;
}

/** What a foreman has to work from: how much of the ground the player's notes cover. */
function liftWords(lift: number): string {
  if (lift <= 0) return 'No field notes here to work from: pan a few spots yourself and they can do far more.';
  if (lift < 0.5) return 'Your notes cover some of the ground: they help the crew a little.';
  if (lift < 0.95) return 'Your notes cover most of the ground: the crew works well under them.';
  return 'Your notes cover all of it: the crew works as well as it can.';
}

/** Crew policies as the player reads them: a name, and what it costs. */
const POLICY_WORDS: Record<CrewPolicy, { readonly name: string; readonly note: string }> = {
  steady: { name: 'Steady', note: 'Their usual pace and care.' },
  careful: { name: 'Careful', note: 'Slower and gentler: less ground a day, less gold lost from it.' },
  push: { name: 'Push hard', note: 'Faster and rougher: more ground a day, more gold washed away.' },
  prepare: { name: 'Prepare the ground', note: 'No washing: they strip topsoil, pry boulders and bail holes, so the pay gravel is open when you come.' },
};

type TabletTab = 'overview' | 'claims' | 'crew' | 'leads' | 'costs';

const HEALTH_WORDS: Record<ClaimHealth, string> = { steady: 'Steady', warn: 'Needs a look', critical: 'Trouble', noCrew: 'No crew' };

const JOB_STATE_WORDS: Record<string, string> = {
  working: 'working',
  noOne: 'nobody free for it',
  needsOperator: 'needs an operator',
  standingBack: 'standing back while you’re there',
  noMachine: 'needs a crew unit (outfitter)',
  noSite: 'no free spot for it',
  noWater: 'no water here',
  workedOut: 'ground worked out',
  bucketFull: 'crew bucket full',
  noFuel: 'out of fuel cans',
  nothingToFinish: 'nothing to finish yet',
  groundReady: 'ground prepared, nothing left to clear',
  needsService: 'engine seized, waiting on a repair kit',
};

const CREW_GEAR: readonly [CrewMachine, string][] = [
  ['sluice', 'Crew sluice'],
  ['highbanker', 'Crew highbanker'],
  ['trommel', 'Crew trommel'],
  ['rocker', 'Crew rocker box'],
  ['drywasher', 'Crew drywasher'],
  ['classifier', 'Crew classifier'],
];

const HINTS: Record<Mode, string> = {
  creek: 'Walk the creek and pick a spot to dig (click, or press its number). Inside bends, bedrock, black sand, moss lines and boulders are good signs, but only the pan tells the truth.',
  bank: 'Drag from the hole to the pan to fill it, or to the spoil pile to toss it aside. Click a boulder to pry it loose; click a flooded hole to bail it.',
  town: 'The buyer weighs your gold and pays spot less a cut. Bigger lots get a better rate; pickers sell as specimens.',
  region: 'Your known creeks and the town. Click a place to walk there. Follow leads from your notebook to find new stretches.',
  pan: 'Hold Space or the pan to sift · sift level until the water clears, then tip with W/S or the wheel to wash · click rocks to rake them out',
  sluice: 'Set the intake with the Water slider · feed it from the hole · click the header to rake a clog · clean out before the moss fills',
  classifier: 'Hold Space or the screen to sift · click a rock to check it for a wedged picker · tip off the oversize when only rocks are left',
  magnet: 'Hold Space or Pass to sweep the magnet over the sand · W/S or the wheel sets how close · shake the clump back (B), then strip it off (T)',
  rocker: 'Ladle water over the screen (L) · rock with Space on a steady beat · tip the rocks off (T) · clean up the apron (C) before it loads up',
  highbanker: 'Prime the pump (P) · start the engine (E) · set the Throttle · shovel into the hopper (F) · clear jams (R) · watch the heat and fuel',
  trommel: 'Start the engine (E) · set the Drum to tumble and the Spray · shovel into the hopper (F) · clear a jammed drum (R) · clean out the deck (C)',
  drywasher: 'Hold Space or Pump to work the bellows · W/S or the wheel sets the Air · shake out the dust (D) · knock the screen (K) · pull the drawer (C)',
};

/** Shorter hints without keys, for touchscreens. */
const TOUCH_HINTS: Record<Mode, string> = {
  creek: 'Tap a spot to read its signs, then tap again to dig. Only the pan tells the truth.',
  bank: 'Drag from the hole to the pan, or to the spoil pile. Tap a boulder to pry it; tap a flooded hole to bail.',
  town: 'The buyer pays spot less a cut. Bigger lots get a better rate.',
  region: 'Tap a place to walk there. Follow leads from your notebook.',
  pan: 'Hold the pan or Sift · sift level until the water clears, then tip with the slider to wash · tap rocks to rake them out',
  sluice: 'Water slider sets the intake · tap the header to rake a clog · clean out before the moss fills',
  classifier: 'Hold the screen or Sift · tap a rock to check it for a picker · tip off the oversize when only rocks are left',
  magnet: 'Hold Pass to sweep the magnet · the slider sets how close · shake the clump back, then strip it off',
  rocker: 'Ladle water over the screen · tap Rock on a steady beat · tip the rocks off · clean up the apron before it loads up',
  highbanker: 'Prime the pump · start the engine · set the Throttle · shovel into the hopper · tap the hopper to clear a jam',
  trommel: 'Start the engine · set the Drum to tumble and the Spray · shovel into the hopper · tap the drum to clear a jam',
  drywasher: 'Hold Pump to work the bellows · the slider sets the Air · shake out the dust · knock the screen · pull the drawer',
};

const SOURCE_NAMES: Record<LeadSource, string> = {
  colourTrail: 'Colour trail',
  clue: 'Clue',
  rumour: 'Rumour',
  claimRecord: 'Old claim record',
  mapFragment: 'Map fragment',
};

const SLOPE_WORDS = { shallow: 'too shallow', good: 'good', steep: 'too steep' } as const;

const LAYER_NAMES = { overburden: 'topsoil', gravel: 'gravel', payStreak: 'pay streak', bedrock: 'bedrock cracks' } as const;

/**
 * DOM controls around the canvas. Buttons and hints change with the mode; the tilt slider and
 * Sift button (for touch) only show while panning. The inspection panel of readouts is always up,
 * and the way back (what Esc does) always sits in the same place, top left.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly panControls: HTMLElement;
  private readonly tilt: HTMLInputElement;
  private readonly sift: HTMLButtonElement;
  /** The way back, pinned top left: whatever Esc does on this screen. */
  private readonly back: HTMLElement;
  private backAction: (() => void) | null = null;
  private readonly tiltLabel: HTMLElement;
  private readonly water: HTMLElement;
  private readonly waterInput: HTMLInputElement;
  private readonly slope: HTMLElement;
  private readonly slopeInput: HTMLInputElement;
  private readonly actions: HTMLElement;
  private readonly result: HTMLElement;
  private readonly inspect: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly cash: HTMLElement;
  /** The bar under the clock, filling toward the next day. */
  private readonly dayFill: HTMLElement;
  /** A word under the clock when money is short, with the countdown to shutdown when insolvent. */
  private readonly moneyLine: HTMLElement;
  private readonly cashButton: HTMLElement;
  private readonly panel: HTMLElement;
  private panelKey = '';
  /** The field tablet: an overlay for checking claims, crew and costs from anywhere. */
  private readonly tablet: HTMLElement;
  private readonly tabletBody: HTMLElement;
  private readonly tabletClock: HTMLElement;
  private readonly tabletClose: HTMLElement;
  private tabletTab: TabletTab = 'overview';
  private tabletSelected: number | null = null;
  private tabletKey = '';
  /** Open: game time stands still while the player reads it. */
  tabletOpen = false;
  /** Small screens start with the notebook and claims board folded up. */
  /** Followed and dud leads, and released claims, are folded away unless opened. */
  private showOldLeads = false;
  private showReleased = false;
  private panelCollapsed = matchMedia('(max-width: 700px), (max-height: 500px)').matches;
  /** Which tab of the town's side menu is open; remembered between visits. */
  private townTab: 'outfitter' | 'claims' | 'office' = 'outfitter';
  private buttonsKey = '';
  private resultKey = '';
  private lossRate = 0;
  private toastTimer = 0;
  /** Recent messages, newest first, for the tablet's Overview. */
  private readonly messages: { readonly text: string; readonly when: string }[] = [];
  private state: HudState | null = null;

  constructor(private readonly on: HudActions) {
    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="hud-top"><button type="button" class="hud-back" hidden></button><div class="hud-hint"></div></div>
      <button type="button" class="hud-cash" title="Field tablet: claims, crew, leads and costs"><span class="hud-cash-row"><span class="hud-led"></span><span class="hud-cash-text"></span></span><span class="hud-day" title="How far through the working day"><span class="hud-day-fill"></span></span><span class="hud-money" hidden></span></button>
      <div class="hud-result" hidden></div>
      <div class="hud-inspect"></div>
      <div class="hud-toast" role="status" aria-live="polite" hidden><span class="hud-led"></span><span class="hud-toast-text"></span></div>
      <div class="hud-panel" hidden></div>
      <div class="tablet" hidden>
        <div class="tablet-screen">
          <div class="tablet-head"><b>Field tablet</b><span class="tablet-clock"></span><button type="button" data-t="close">Close (Esc)</button></div>
          <div class="tablet-tabs" role="tablist">
            <button type="button" role="tab" data-ttab="overview">Overview</button>
            <button type="button" role="tab" data-ttab="claims">Claims</button>
            <button type="button" role="tab" data-ttab="crew">Crew</button>
            <button type="button" role="tab" data-ttab="leads">Leads</button>
            <button type="button" role="tab" data-ttab="costs">Costs</button>
          </div>
          <div class="tablet-body"></div>
        </div>
      </div>
      <div class="hud-bar">
        <span class="hud-pan-controls">
          <label class="hud-tilt">Tilt <input type="range" min="0" max="1" step="0.01" value="0" /></label>
          <button type="button" class="hud-shake">Sift</button>
        </span>
        <label class="hud-tilt hud-water" hidden>Water <input type="range" min="0" max="1" step="0.01" value="0.6" /></label>
        <label class="hud-tilt hud-slope" hidden>Slope <input type="range" min="0" max="1" step="0.01" value="0.5" /></label>
        <span class="hud-actions"></span>
      </div>`;
    document.body.appendChild(this.root);

    this.hint = this.root.querySelector('.hud-hint') as HTMLElement;
    this.panControls = this.root.querySelector('.hud-pan-controls') as HTMLElement;
    this.tilt = this.root.querySelector('input') as HTMLInputElement;
    this.tiltLabel = this.tilt.closest('label') as HTMLElement;
    this.water = this.root.querySelector('.hud-water') as HTMLElement;
    this.waterInput = this.water.querySelector('input') as HTMLInputElement;
    this.waterInput.addEventListener('input', () => on.setWater(Number(this.waterInput.value)));
    this.slope = this.root.querySelector('.hud-slope') as HTMLElement;
    this.slopeInput = this.slope.querySelector('input') as HTMLInputElement;
    this.slopeInput.addEventListener('input', () => on.setSlope(Number(this.slopeInput.value)));
    this.actions = this.root.querySelector('.hud-actions') as HTMLElement;
    this.result = this.root.querySelector('.hud-result') as HTMLElement;
    this.inspect = this.root.querySelector('.hud-inspect') as HTMLElement;
    this.toastEl = this.root.querySelector('.hud-toast') as HTMLElement;
    // Tap a message to put it away; it stays on the tablet's Overview.
    this.toastEl.addEventListener('click', () => {
      this.toastEl.hidden = true;
      this.toastTimer = 0;
    });
    this.cash = this.root.querySelector('.hud-cash-text') as HTMLElement;
    this.dayFill = this.root.querySelector('.hud-day-fill') as HTMLElement;
    this.moneyLine = this.root.querySelector('.hud-money') as HTMLElement;
    // The clock and cash are the tablet's lock screen: tap them to open it.
    this.cashButton = this.root.querySelector('.hud-cash') as HTMLElement;
    this.cashButton.addEventListener('click', () => (this.tabletOpen ? this.closeTablet() : this.openTablet()));
    this.panel = this.root.querySelector('.hud-panel') as HTMLElement;
    this.tablet = this.root.querySelector('.tablet') as HTMLElement;
    this.tabletBody = this.root.querySelector('.tablet-body') as HTMLElement;
    this.tabletClock = this.root.querySelector('.tablet-clock') as HTMLElement;
    this.tabletClose = this.root.querySelector('[data-t="close"]') as HTMLElement;
    this.tablet.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-t], [data-ttab], [data-claim], [data-go]');
      if (!target) return;
      if (target.dataset.t === 'close') return this.closeTablet();
      if (target.dataset.ttab) {
        this.tabletTab = target.dataset.ttab as TabletTab;
        this.tabletKey = '';
        return;
      }
      if (target.dataset.go) {
        const id = Number(target.dataset.go);
        this.closeTablet();
        return this.on.goToClaim(id);
      }
      if (target.dataset.claim) {
        // Tap a card to read it; tap it again to fold it away.
        const id = Number(target.dataset.claim);
        this.tabletSelected = this.tabletSelected === id ? null : id;
        this.tabletKey = '';
      }
    });
    this.panel.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (tab) {
        // Picking a tab always opens the menu; picking the open tab again folds it away.
        const same = tab.dataset.tab === this.townTab && !this.panelCollapsed;
        this.townTab = tab.dataset.tab as 'outfitter' | 'claims' | 'office';
        this.panelCollapsed = same;
        this.panelKey = '';
        return;
      }
      if ((e.target as HTMLElement).closest('h3')) {
        this.panelCollapsed = !this.panelCollapsed;
        this.panel.classList.toggle('collapsed', this.panelCollapsed);
        return;
      }
      const target = (e.target as HTMLElement).closest('button');
      if (!target) return;
      target.blur();
      const id = Number(target.dataset.lead);
      if (target.dataset.action === 'gear') this.on.buyGear(target.dataset.gear as GearId);
      if (target.dataset.action === 'fuel') this.on.buyFuel();
      if (target.dataset.action === 'kit') this.on.buyRepairKit();
      if (target.dataset.action === 'leavejar') this.on.leaveJar();
      if (target.dataset.action === 'counter') this.on.collectCounter();
      if (target.dataset.action === 'hire') this.on.hireApplicant(Number(target.dataset.applicant));
      if (target.dataset.action === 'dismiss') this.on.dismissHand(Number(target.dataset.worker));
      if (target.dataset.action === 'send') this.on.sendHand(Number(target.dataset.creek), target.dataset.role as Role);
      if (target.dataset.action === 'recall') this.on.recallHand(Number(target.dataset.creek));
      if (target.dataset.action === 'job') this.on.toggleJob(Number(target.dataset.creek), target.dataset.job as JobKind);
      if (target.dataset.action === 'policy') this.on.setPolicy(Number(target.dataset.creek), target.dataset.policy as CrewPolicy);
      if (target.dataset.action === 'crewgear') this.on.buyCrewMachine(target.dataset.machine as CrewMachine);
      if (target.dataset.action === 'returned') this.on.washReturned();
      if (target.dataset.action === 'release') this.on.releaseClaim(Number(target.dataset.creek));
      if (target.dataset.action === 'restake') this.on.restakeClaim(Number(target.dataset.creek));
      if (target.dataset.action === 'buy') this.on.buyLead(id);
      if (target.dataset.action === 'follow') this.on.followLead(id);
      if (target.dataset.action === 'oldleads') this.showOldLeads = !this.showOldLeads;
      if (target.dataset.action === 'released') this.showReleased = !this.showReleased;
      if (target.dataset.action === 'oldleads' || target.dataset.action === 'released') this.panelKey = '';
    });

    this.tilt.addEventListener('input', () => on.setTilt(Number(this.tilt.value)));
    const shake = this.root.querySelector('.hud-shake') as HTMLButtonElement;
    this.sift = shake;
    shake.addEventListener('pointerdown', () => on.setShake(true));
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) shake.addEventListener(type, () => on.setShake(false));
    this.back = this.root.querySelector('.hud-back') as HTMLElement;
    this.back.addEventListener('click', () => {
      this.back.blur();
      this.backAction?.();
    });
    window.addEventListener('keydown', (e) => {
      // Space rocks the rocker one stroke per press; don't let it scroll or press a focused button.
      if (e.key === ' ' && this.state?.mode === 'rocker') e.preventDefault();
      this.handleKey(e.key.toLowerCase(), e.repeat);
    });
  }

  toast(message: string): void {
    // News arrives on the tablet: the message drops out from under it and the light blinks.
    (this.toastEl.querySelector('.hud-toast-text') as HTMLElement).textContent = forInput(message);
    this.toastEl.hidden = false;
    for (const el of [this.toastEl, this.cashButton]) {
      el.classList.remove('ping');
      void el.offsetWidth; // Restart the animation.
      el.classList.add('ping');
    }
    const economy = this.state?.economy;
    this.messages.unshift({ text: message, when: economy ? `Day ${economy.day}, ${economy.timeOfDay}` : '' });
    this.messages.length = Math.min(this.messages.length, 8);
    this.tabletKey = '';
    // Longer messages stay up longer.
    this.toastTimer = Math.max(3, message.length / 18);
  }

  update(dt: number, state: HudState): void {
    this.state = state;
    const { mode, session, controls, events } = state;
    const pan = session.pan;

    const tabletTitle = forInput('Field tablet (O): claims, crew, leads and costs');
    if (this.cashButton.title !== tabletTitle) this.cashButton.title = tabletTitle;
    setLabel(this.tabletClose, forInput('Close (Esc)'));
    const hint =
      mode === 'bank' && state.drywasher
        ? usingTouch()
          ? 'A dry wash: drag shovelfuls up to the drywasher behind the classifier, or to the pan if the wash tub has water. Tap the drywasher for a close look.'
          : 'A dry wash: drag shovelfuls up to the drywasher (Y), or to the pan (P) if the wash tub has water. Click the drywasher for a close look.'
        : mode === 'bank' && !state.canPan
        ? usingTouch()
          ? 'No water in a dry wash: drag shovelfuls to the rocker (with water you haul in) or the spoil pile. A wash tub or a drywasher from town would help.'
          : 'No water in a dry wash: drag shovelfuls to the rocker (H), with water you haul in, or the spoil pile (T). A wash tub or a drywasher from town would help.'
        : mode === 'bank' && state.rocker && !state.sluice
        ? usingTouch()
          ? 'Drag shovelfuls up to the rocker behind the pan, to the pan, or to the spoil pile. Tap the rocker for a close look.'
          : 'Drag shovelfuls up to the rocker behind the pan (H), to the pan (P), or to the spoil pile (T). Click the rocker for a close look.'
        : mode === 'bank' && state.classifier && !state.sluice
        ? usingTouch()
          ? 'Drag shovelfuls to the classifier to screen them, to the pan, or to the spoil pile. Tap the classifier for a close look.'
          : 'Drag shovelfuls to the classifier to screen them (K), the pan (P), or the spoil pile (T). Click the classifier for a close look.'
        : mode === 'pan' && state.canSnuff
        ? usingTouch()
          ? 'Tap along the black-sand tail to snuff up fine gold: the head holds the heavy pieces, fines string out behind. Draw too much and the bottle clouds.'
          : 'Click along the black-sand tail, or press F to work along it, to snuff up fine gold. Draw too much and the bottle clouds.'
        : mode === 'bank' && state.sluice
        ? usingTouch()
          ? 'Drag shovelfuls to the sluice in the creek, the pan, or the spoil pile. Tap the sluice for a close look.'
          : 'Drag shovelfuls to the sluice in the creek (F), the pan (P), or the spoil pile (T). Click the sluice for a close look.'
        : usingTouch()
          ? TOUCH_HINTS[mode]
          : HINTS[mode];
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    const cash = `Day ${state.economy.day} · ${state.economy.timeOfDay} · $${session.cash.toFixed(2)}`;
    if (this.cash.textContent !== cash) this.cash.textContent = cash;
    const width = `${(state.economy.dayProgress * 100).toFixed(1)}%`;
    if (this.dayFill.style.width !== width) this.dayFill.style.width = width;
    const m = state.money;
    const moneyText =
      m.state === 'strained'
        ? 'Money tight'
        : m.state === 'insolvent'
          ? `Insolvent: shutdown in ${m.daysToShutdown === null || m.daysToShutdown < 0.5 ? 'under half a day' : `~${Math.round(m.daysToShutdown * 2) / 2} days`}`
          : m.state === 'recovering'
            ? 'Paying off debts'
            : '';
    if (this.moneyLine.textContent !== moneyText) this.moneyLine.textContent = moneyText;
    this.moneyLine.hidden = moneyText === '';
    this.moneyLine.classList.toggle('danger', m.state === 'insolvent');
    // The tablet's light goes red when the books or a claim need the player.
    this.cashButton.classList.toggle('alert', m.state !== 'healthy' || state.economy.anyLapsed || state.crew.wagesOverdue);
    // Tilt and Sift only matter while the pan is being worked; after the reveal they go away.
    // The classifier is sifted too, but has nothing to tilt.
    const classifying = mode === 'classifier' && state.classifier !== null;
    const magnet = mode === 'magnet';
    const drywashing = mode === 'drywasher' && state.drywasher !== null;
    this.panControls.hidden = !classifying && !magnet && !drywashing && (mode !== 'pan' || pan?.phase !== 'working');
    this.tiltLabel.hidden = classifying;
    // The magnet reuses the pan's controls: Pass instead of Sift, and closeness instead of tilt.
    const siftText = magnet ? 'Pass' : drywashing ? 'Pump' : 'Sift';
    if (this.sift.textContent !== siftText) this.sift.textContent = siftText;
    const tiltText = magnet ? 'Closeness ' : drywashing ? 'Air ' : 'Tilt ';
    if (this.tiltLabel.firstChild && this.tiltLabel.firstChild.textContent !== tiltText) this.tiltLabel.firstChild.textContent = tiltText;
    // The same slider is the sluice's Water, the highbanker's Throttle, or the trommel's Spray;
    // the second is the sluice's Slope (with legs) or the trommel's Drum speed.
    const onTrommel = state.trommel !== null && (mode === 'bank' || mode === 'trommel');
    const onHighbanker = !onTrommel && state.highbanker !== null && (mode === 'bank' || mode === 'highbanker');
    this.water.hidden = !(onTrommel || onHighbanker || (state.sluice && (mode === 'bank' || mode === 'sluice')));
    const waterText = onTrommel ? 'Spray ' : onHighbanker ? 'Throttle ' : 'Water ';
    if (this.water.firstChild && this.water.firstChild.textContent !== waterText) this.water.firstChild.textContent = waterText;
    if (!this.water.hidden && document.activeElement !== this.waterInput) this.waterInput.value = String(onTrommel ? state.spray : onHighbanker ? state.throttle : state.sluiceFlow);
    const slopeText = onTrommel ? 'Drum ' : 'Slope ';
    if (this.slope.firstChild && this.slope.firstChild.textContent !== slopeText) this.slope.firstChild.textContent = slopeText;
    if (onTrommel) {
      this.slope.hidden = false;
      this.slopeInput.min = '0';
      this.slopeInput.max = '1';
      if (document.activeElement !== this.slopeInput) this.slopeInput.value = String(state.drumSpeed);
    }
    // Adjustable legs: the slider covers only as far as the legs reach at this site.
    else this.slope.hidden = this.water.hidden || !state.sluice?.kit.legs;
    if (!onTrommel && !this.slope.hidden && state.sluice && document.activeElement !== this.slopeInput) {
      const { min, max } = state.sluice.slopeRange;
      this.slopeInput.min = String(min);
      this.slopeInput.max = String(max);
      this.slopeInput.value = String(state.sluice.slope);
    }
    if ((mode === 'pan' || magnet || drywashing) && document.activeElement !== this.tilt) this.tilt.value = String(controls.tilt);
    // Nothing left to sift once the sand reads 0%. A disabled button gets no pointerup, so let go of it here.
    const siftedOut = drywashing
      ? false
      : magnet
      ? session.jar.magnetite < 0.002
      : classifying
      ? !state.classifier!.hasLoad || state.classifier!.screened
      : pan?.phase === 'working' && pan.siftedOut;
    if (siftedOut && !this.sift.disabled) this.on.setShake(false);
    this.sift.disabled = siftedOut;

    // The way back leaves the bar for its fixed place top left.
    const all = this.buttonsFor(state);
    const backAt = all.findIndex(([label]) => isBack(label));
    const [backEntry] = backAt >= 0 ? all.splice(backAt, 1) : [];
    this.back.hidden = !backEntry;
    this.backAction = backEntry?.[1] ?? null;
    if (backEntry) setLabel(this.back, forInput(`‹ ${backEntry[0]}`));
    const buttons = all.map(([label, action]): [string, () => void] => [forInput(label), action]);
    const key = buttons.map(([label]) => label).join('|');
    if (key !== this.buttonsKey) {
      this.buttonsKey = key;
      this.actions.replaceChildren(...buttons.map(([label, action]) => button(label, action)));
    }

    const resultKey =
      mode === 'pan' && pan ? `${pan.phase}:${pan.kind}:${session.pansWorked}:${session.vial.length}`
      : mode === 'town' ? `town:${session.vial.length}:${session.cash}`
      : '';
    if (resultKey !== this.resultKey) {
      this.resultKey = resultKey;
      this.result.hidden = mode === 'town' ? false : !pan || mode !== 'pan' || pan.phase === 'working';
      this.result.classList.toggle('hud-result-town', mode === 'town');
      if (mode === 'town') this.result.textContent = describeOffer(session);
      else if (mode !== 'pan') {
        // No result card on other screens.
      } else if (pan?.phase === 'revealed') {
        const cover = pan.kind === 'concentrate' ? 'black sand' : 'sand';
        this.result.textContent = describeFind(pan.visible, pan.lightSand / pan.initialLightSand, cover);
      }
      else if (pan?.phase === 'emptied') {
        const what = pan.kind === 'concentrate' ? 'Concentrate panned.' : `Pan ${session.pansWorked} done.`;
        this.result.textContent = `${what} ${session.vialMg.toFixed(1)} mg in the vial.`;
      }
    }

    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toastEl.hidden = true;
    this.renderPanel(state);
    this.renderTablet(state);

    const spilled = events ? events.darkSpilled / Math.max(dt, 1e-6) : 0;
    this.lossRate += (spilled - this.lossRate) * Math.min(1, dt * 3);
    this.renderInspect(state);
  }

  private buttonsFor(state: HudState): [string, () => void][] {
    const { mode, session, creek, spot } = state;
    if (mode === 'pan') {
      const phase = session.pan?.phase;
      if (phase === 'working') return [['Stop & reveal (R)', () => this.on.reveal()]];
      const snuff: [string, () => void][] = state.canSnuff ? [['Snuff the tail (F)', () => this.on.snuff()]] : [];
      if (phase === 'revealed' && session.pan?.residueSpent) {
        return [...snuff, ['Collect (C)', () => this.on.collect(false)]];
      }
      if (phase === 'revealed') {
        const save = session.canSaveBlackSand ? 'Collect, save black sand (C)' : 'Collect, save black sand (jar full)';
        return [
          ...snuff,
          [save, () => this.on.collect(true)],
          ['Collect, dump black sand (D)', () => this.on.collect(false)],
        ];
      }
      // Keep panning from the classifier's bucket without walking back to it.
      const bucket: [string, () => void][] =
        state.classifier && state.classifier.bucketVolume > 0.005 ? [['Pan from the bucket (B)', () => this.on.panBucket()]] : [];
      return [...bucket, [state.panInTown ? 'Back to the counter (N)' : 'Back to the hole (N)', () => this.on.backToHole()], ...this.jarButton(session)];
    }
    if (mode === 'bank' && spot) {
      const blocked = creek.blockedBy(spot);
      const list: [string, () => void][] = [];
      if (blocked === null) {
        if (state.canPan) list.push(['Shovel into pan (P)', () => this.on.shovel('pan')]);
        list.push(['Toss aside (T)', () => this.on.shovel('spoil')]);
      }
      if (blocked === 'boulder') list.push(['Pry boulder (B)', () => this.on.pry()]);
      if (spot.water > 0.2) list.push(['Bail with pan (A)', () => this.on.bail()]);
      if (state.classifier) {
        if (blocked === null) list.push(['Shovel onto the classifier (K)', () => this.on.shovel('classifier')]);
        list.push(['Classifier (C)', () => this.on.openClassifier()]);
      }
      if (state.rocker) {
        if (blocked === null) list.push(['Shovel onto the rocker (H)', () => this.on.shovel('rocker')]);
        list.push(['Rocker (O)', () => this.on.openRocker()]);
      }
      if (state.sluice) {
        if (blocked === null && !state.cleaningOut) list.push(['Shovel into sluice (F)', () => this.on.shovel('sluice')]);
        list.push(['Watch the sluice (V)', () => this.on.openSluice()]);
        list.push(...this.refuelButton(state));
      } else if (spot.sluiceSite && session.owns('sluice') && !state.highbanker && !state.trommel) {
        list.push([session.sluicePlace ? 'Move the sluice here' : 'Set up the sluice here', () => this.on.setUpSluice()]);
      }
      if (state.drywasher) {
        if (blocked === null) list.push(['Shovel onto the drywasher (Y)', () => this.on.shovel('drywasher')]);
        list.push(['Drywasher (D)', () => this.on.openDrywasher()]);
      }
      if (state.tub && (state.tub.water < 1 || state.tub.turbidity > 0)) {
        list.push([state.tubFetching ? 'Hauling water…' : 'Change the tub water (U)', () => this.on.changeTubWater()]);
      }
      if (state.trommel) {
        if (blocked === null && !state.trommel.rinsing) list.push(['Shovel into the trommel (F)', () => this.on.shovel('trommel')]);
        list.push(['Watch the trommel (V)', () => this.on.openTrommel()]);
      } else if (!state.sluice && !state.highbanker && !spot.gully && session.owns('trommel') && siteAllows(state.creek.profile.site, 'trommel')) {
        list.push([session.trommelPlace ? 'Move the trommel here' : 'Set up the trommel here', () => this.on.setUpTrommel()]);
      }
      if (state.highbanker) {
        if (blocked === null && !state.highbanker.rinsing) list.push(['Shovel into the highbanker (F)', () => this.on.shovel('highbanker')]);
        list.push(['Watch the highbanker (V)', () => this.on.openHighbanker()], ...this.highbankerFuelButton(state));
      } else if (!state.sluice && !state.trommel && !spot.gully && session.owns('highbanker') && siteAllows(state.creek.profile.site, 'highbanker')) {
        list.push([session.highbankerPlace ? 'Move the highbanker here' : 'Set up the highbanker here', () => this.on.setUpHighbanker()]);
      }
      list.push(...this.crewBucketButton(state), ...this.jarButton(session), ...this.magnetButton(state));
      list.push(['Walk the creek (Esc)', () => this.on.walkCreek()]);
      return list;
    }
    if (mode === 'classifier' && state.classifier) {
      const c = state.classifier;
      const list: [string, () => void][] = [];
      if (!c.hasLoad) list.push([c.screen === 'coarse' ? 'Swap to the fine screen' : 'Swap to the coarse screen', () => this.on.swapScreen()]);
      if (!c.hasLoad && state.spot && state.creek.blockedBy(state.spot) === null) {
        list.push(['Shovel onto the screen (K)', () => this.on.shovel('classifier')]);
      }
      if (c.hasLoad) list.push([c.screened ? 'Tip off the oversize (T)' : 'Tip it all off (T)', () => this.on.tipOff()]);
      if (c.bucketVolume > 0.005 && session.panIsFree) list.push(['Pan from the bucket (P)', () => this.on.panBucket()]);
      if (c.bucketVolume > 0.005 && state.sluice && !state.cleaningOut) list.push(['Pour into the sluice (F)', () => this.on.pourIntoSluice()]);
      list.push(['Back to the hole (Esc)', () => this.on.backToHole()]);
      return list;
    }
    if (mode === 'drywasher' && state.drywasher) {
      const dw = state.drywasher;
      const list: [string, () => void][] = [];
      if (dw.dust > 0.15) list.push(['Shake out the dust (D)', () => this.on.shakeOutDust()]);
      if (dw.screenClog > 0.15) list.push(['Knock the screen (K)', () => this.on.knockScreen()]);
      if (dw.hasLoad) list.push([dw.screened ? 'Tip off the rocks (T)' : 'Tip it all off (T)', () => this.on.tipDrywasher()]);
      if (!dw.hopperFull && state.spot && state.creek.blockedBy(state.spot) === null) list.push(['Shovel onto the screen (Y)', () => this.on.shovel('drywasher')]);
      if (state.classifier && state.classifier.bucketVolume > 0.005 && !dw.hopperFull) list.push(['Pour in the classifier bucket (B)', () => this.on.pourIntoDrywasher()]);
      if (dw.drawerVolume > 0.001 || dw.drawerGoldCount > 0) list.push(['Pull the drawer (C)', () => this.on.pullDrawer()]);
      list.push(...this.mendButton(state, dw.wear), ...this.jarButton(session), ['Back to the hole (Esc)', () => this.on.backToHole()]);
      return list;
    }
    if (mode === 'highbanker' && state.highbanker) {
      const hb = state.highbanker;
      if (hb.rinsing) {
        return [['Lift the mat (L)', () => this.on.liftHighbankerMat()], ['Keep running', () => this.on.cancelHighbankerCleanout()], ...this.jarButton(session)];
      }
      const list: [string, () => void][] = [];
      if (!hb.primed) list.push([state.priming ? 'Priming…' : 'Prime the pump (P)', () => this.on.primePump()]);
      list.push([hb.running ? 'Stop the engine (E)' : 'Start the engine (E)', () => this.on.toggleEngine()]);
      if (hb.jammed) list.push(['Clear the grizzly (R)', () => this.on.clearHighbanker()]);
      else if (hb.sluice.clog > 0.3) list.push(['Rake the intake (R)', () => this.on.clearHighbanker()]);
      if (state.spot && state.creek.blockedBy(state.spot) === null && !hb.hopperFull) list.push(['Shovel into the hopper (F)', () => this.on.shovel('highbanker')]);
      if (state.classifier && state.classifier.bucketVolume > 0.005 && !hb.hopperFull) list.push(['Pour in the classifier bucket (B)', () => this.on.pourIntoHighbanker()]);
      list.push(...this.mendButton(state, hb.seized ? 1 : Math.max(hb.engineWear, hb.sluice.wear)));
      list.push(...this.highbankerFuelButton(state), ['Clean out the moss (C)', () => this.on.highbankerCleanout()], ...this.jarButton(session));
      list.push(['Back to the hole (Esc)', () => this.on.backToHole()], ['Take down the highbanker', () => this.on.takeDownHighbanker()]);
      return list;
    }
    if (mode === 'trommel' && state.trommel) {
      const t = state.trommel;
      if (t.rinsing) {
        return [['Lift the mat (L)', () => this.on.liftTrommelMat()], ['Keep running', () => this.on.cancelTrommelCleanout()], ...this.jarButton(session)];
      }
      const list: [string, () => void][] = [[t.running ? 'Stop the engine (E)' : 'Start the engine (E)', () => this.on.toggleTrommel()]];
      if (t.jammed) list.push(['Clear the drum (R)', () => this.on.clearTrommel()]);
      else if (t.deck.clog > 0.3) list.push(['Rake the deck (R)', () => this.on.clearTrommel()]);
      if (state.spot && state.creek.blockedBy(state.spot) === null && !t.hopperFull) list.push(['Shovel into the hopper (F)', () => this.on.shovel('trommel')]);
      if (t.fuel <= TROMMEL_TUNING.tank * 0.75 && session.fuelCans > 0) list.push([`Refuel (G) · ${session.fuelCans} can${session.fuelCans === 1 ? '' : 's'}`, () => this.on.refuelTrommel()]);
      list.push(['Clean out the deck (C)', () => this.on.trommelCleanout()], ...this.mendButton(state, t.seized ? 1 : t.wear), ...this.jarButton(session));
      list.push(['Back to the hole (Esc)', () => this.on.backToHole()], ['Take down the trommel', () => this.on.takeDownTrommel()]);
      return list;
    }
    if (mode === 'rocker' && state.rocker) {
      const r = state.rocker;
      if (state.fetchingWater) return [['Back to the hole (Esc)', () => this.on.backToHole()]];
      const list: [string, () => void][] = [['Rock (Space)', () => this.on.rock()]];
      if (r.bucket > 0) list.push([`Ladle water (L) · ${r.bucket} left`, () => this.on.ladle()]);
      if (r.bucket < ROCKER_TUNING.bucketLadles) list.push(['Fetch water (E)', () => this.on.fetchWater()]);
      if (r.hasLoad) list.push([r.screened ? 'Tip off the rocks (T)' : 'Tip it all off (T)', () => this.on.tipRocker()]);
      if (!r.hopperFull && state.spot && state.creek.blockedBy(state.spot) === null) list.push(['Shovel onto the screen (H)', () => this.on.shovel('rocker')]);
      if (state.classifier && state.classifier.bucketVolume > 0.005 && !r.hopperFull) list.push(['Pour in the classifier bucket (B)', () => this.on.pourIntoRocker()]);
      if (r.apronVolume > 0.001 || r.apronGoldCount > 0) list.push(['Clean up the apron (C)', () => this.on.cleanUpRocker()]);
      list.push(...this.mendButton(state, r.wear), ...this.jarButton(session), ['Back to the hole (Esc)', () => this.on.backToHole()]);
      return list;
    }
    if (mode === 'magnet') {
      const list: [string, () => void][] = [];
      if (session.clump.sand > 0) list.push(['Shake the clump back (B)', () => this.on.shakeClump()], ['Strip off the clump (T)', () => this.on.stripClump()]);
      list.push(['Done (Esc)', () => this.on.closeMagnet()]);
      return list;
    }
    if (mode === 'sluice' && state.sluice) {
      if (state.cleaningOut) {
        return [
          ['Lift the mat (L)', () => this.on.liftMat()],
          ['Keep sluicing', () => this.on.cancelCleanout()],
          ...this.jarButton(session),
        ];
      }
      const list: [string, () => void][] = [];
      if (state.sluice.clog > 0.3) list.push(['Rake the intake (R)', () => this.on.rakeSluice()]);
      list.push(...this.refuelButton(state));
      if (state.spot && state.creek.blockedBy(state.spot) === null) list.push(['Shovel into sluice (F)', () => this.on.shovel('sluice')]);
      list.push(['Clean out the moss (C)', () => this.on.startCleanout()]);
      list.push(...this.mendButton(state, state.sluice.wear), ...this.jarButton(session));
      list.push(['Back to the hole (Esc)', () => this.on.backToHole()], ['Take down the sluice', () => this.on.takeDownSluice()]);
      return list;
    }
    if (mode === 'town') {
      const offer = quoteSale(session.vial);
      const sell: [string, () => void][] = offer.total > 0 ? [[`Sell the vial for $${offer.total.toFixed(2)} (S)`, () => this.on.sell()]] : [];
      // The assay office has a wash trough out back: the jar can be panned down here too.
      const pan: [string, () => void][] =
        session.pan && !session.panIsFree ? [['Back to your pan (J)', () => this.on.panConcentrate()]] : this.jarButton(session);
      const counter = state.crew.findSite(TOWN_SITE)?.poke.length ?? 0;
      const collect: [string, () => void][] = counter > 0 ? [['Collect from the counter (W)', () => this.on.collectCounter()]] : [];
      return [
        ...sell,
        ...collect,
        ...pan,
        ...this.magnetButton(state),
        ['Region map (Esc)', () => this.on.openRegion()],
        [`Back to ${state.creek.profile.name}`, () => this.on.walkCreek()],
      ];
    }
    if (mode === 'region') {
      // Zoom works by wheel and pinch too; these are for keys and for anyone without either.
      return [
        [`Back to ${state.creek.profile.name} (Esc)`, () => this.on.walkCreek()],
        ['Walk to town (T)', () => this.on.walkToTown()],
        ['Zoom in (+)', () => this.on.zoomMap(1.3)],
        ['Zoom out (−)', () => this.on.zoomMap(1 / 1.3)],
        ['Fit the map (0)', () => this.on.zoomMap(0)],
        ['Start over', () => this.on.newCreek()],
      ];
    }
    const selected = state.selectedSpot;
    const dig: [string, () => void][] = selected
      ? [[selected.gully ? 'Dig in the gully' : `Dig at spot ${state.creek.creekSpots.indexOf(selected) + 1}`, () => this.on.digSelected()]]
      : [];
    return [...dig, ...this.crewBucketButton(state), ['Region map (Esc)', () => this.on.openRegion()], ['Walk to town (T)', () => this.on.walkToTown()]];
  }

  /** The notebook of leads on the region map, and the claims board in town. */
  private renderPanel(state: HudState): void {
    const { mode, region, session } = state;
    const show = mode === 'region' || mode === 'town';
    const key = show
      ? `${session.repairKits}:${state.crew.applicants.map((a) => a.id).join()}:${mode}:${this.townTab}:${this.panelCollapsed}:${this.showOldLeads}:${this.showReleased}:${session.cash}:${OUTFITTER.map((g) => session.owns(g.id)).join()}:${session.fuelCans}:${JSON.stringify(session.sluicePlace)}:${state.money.state}:${state.money.daysToShutdown?.toFixed(1)}:${this.officeKey(state)}:${region.leads.map((l) => `${l.id}${l.status}`).join()}:${region.offers.map((o) => o.lead.id).join()}`
      : '';
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.panel.hidden = !show;
    this.panel.classList.toggle('collapsed', this.panelCollapsed);
    this.panel.classList.toggle('notebook', mode === 'region');
    if (!show) return;
    if (mode === 'town') {
      const offers = region.offers.map(({ lead, price }) => {
        return `<div class="notice">${leadHeader(lead)}${priceTag(`data-action="buy" data-lead="${lead.id}"`, price, session.cash)}</div>`;
      });
      const gear = OUTFITTER.map((item) => {
        const place = session.sluicePlace;
        const base = item.requires ? OUTFITTER.find((g) => g.id === item.requires)! : null;
        const owned = session.owns(item.id);
        const note = base && !session.owns(base.id)
          ? `<p class="small">Fits the ${base.name.toLowerCase()}: buy that first.</p>`
          : owned && item.id === 'sluice'
            ? `<p class="small">${place ? `Set up at ${region.creek(place.creekId).profile.name}.` : 'Packed and ready to set up.'}</p>`
            : '';
        const side = owned
          ? '<span class="stamp">Yours</span>'
          : priceTag(`data-action="gear" data-gear="${item.id}"`, item.price, session.cash, base && !session.owns(base.id) ? 'Needs the ' + base.name.toLowerCase() : null);
        return ware(item.name, `<p class="small">${item.description}</p>${note}`, side, owned);
      });
      const crew = state.crew;
      gear.push(
        `<h4 class="shelf">For your crew</h4><p class="small">Extra machines, kept apart from your own. A crew job takes one when it needs it, and a sluice or highbanker job uses yours instead if it's set up at that stretch.</p>` +
          CREW_GEAR.map(([machine, name]) =>
            ware(
              name,
              crew.spares[machine] ? `<p class="small">${crew.spares[machine]} spare in town.</p>` : '',
              priceTag(`data-action="crewgear" data-machine="${machine}"`, STAFF_TUNING.machinePrice[machine], session.cash, state.money.canCrewGear ? null : 'Not while money’s tight'),
            ),
          ).join(''),
      );
      // Repair kits, once there's a machine to wear out: the player's own or the crew's.
      const machines = (['sluice', 'rocker', 'drywasher', 'highbanker', 'trommel'] as const).some((g) => session.owns(g)) || Object.values(crew.spares).some((n) => n > 0) || crew.sites.some((s) => s.crewSluice || s.crewHighbanker || s.crewTrommel || s.rocker || s.drywasher);
      if (machines) {
        const full = session.repairKits >= REPAIR_KIT.carryLimit;
        gear.push(
          ware(
            REPAIR_KIT.name,
            `<p class="small">Fresh moss, canvas, riffle bolts and a gasket set. Machines wear with every load, faster fed rocks or run hard, and a worn one keeps less of the fine gold; an engine worn out seizes. One kit puts any machine right, yours or the crew's: your crew uses yours. You're carrying ${session.repairKits} of ${REPAIR_KIT.carryLimit}.</p>`,
            priceTag('data-action="kit"', REPAIR_KIT.price, session.cash, full ? 'Can’t carry more' : null),
          ),
        );
      }
      if (session.owns('pump') || session.owns('highbanker')) {
        const full = session.fuelCans >= FUEL_CAN.carryLimit;
        gear.push(
          ware(
            FUEL_CAN.name,
            `<p class="small">One can fills a tank, the pump's or the highbanker's. You're carrying ${session.fuelCans} of ${FUEL_CAN.carryLimit}.</p>`,
            priceTag('data-action="fuel"', FUEL_CAN.price, session.cash, full ? 'Can’t carry more' : null),
          ),
        );
      }
      const tabs = `<div class="tabs" role="tablist">${(
        [
          ['outfitter', 'Outfitter', ''],
          ['claims', 'Leads', `<span class="count">${region.offers.length}</span>`],
          ['office', 'Claims & crew', state.money.state !== 'healthy' ? '<span class="count warn">!</span>' : ''],
        ] as const
      )
        .map(
          ([id, label, extra]) =>
            `<button type="button" role="tab" data-tab="${id}" aria-selected="${this.townTab === id}" class="${this.townTab === id ? 'active' : ''}">${label}${extra}</button>`,
        )
        .join('')}</div>`;
      const body =
        this.townTab === 'outfitter'
          ? gear.join('')
          : this.townTab === 'office'
          ? this.renderOffice(state)
          : `<div class="board">${offers.join('') || '<p>Nothing posted. Check back after more panning.</p>'}</div><p class="small">New leads go up every few pans. Rumours are cheap and often wrong; maps cost more and rarely lie.</p>`;
      this.panel.innerHTML = `${tabs}<div class="tab-body tab-${this.townTab}">${body}</div>`;
    } else {
      // Leads still to follow come first; followed and dud ones fold away at the back of the book.
      const entry = (lead: Lead): string => {
        const action =
          lead.status === 'open' ? `<button type="button" data-action="follow" data-lead="${lead.id}">Follow it</button>`
          : lead.status === 'dud' ? '<span class="pencil">Nothing there.</span>'
          : '<span class="pencil">Found it. On the map.</span>';
        return `<div class="lead ${lead.status}">${leadHeader(lead)}${action}</div>`;
      };
      const newest = [...region.leads].reverse();
      const openLeads = newest.filter((l) => l.status === 'open');
      const old = newest.filter((l) => l.status !== 'open');
      const body =
        region.leads.length === 0
          ? '<p>No leads yet. Pan along the creek and watch where the colour gets stronger, look for clues while digging, or buy a lead in town.</p>'
          : (openLeads.map(entry).join('') || '<p class="pencil">Nothing left to follow. Pan, dig for clues, or buy a lead in town.</p>') +
            (old.length
              ? `<button type="button" class="fold" data-action="oldleads" aria-expanded="${this.showOldLeads}">${this.showOldLeads ? 'Hide' : 'Show'} old leads (${old.length})</button>${this.showOldLeads ? old.map(entry).join('') : ''}`
              : '');
      this.panel.innerHTML = `<h3>Notebook <span class="count">${openLeads.length ? `${openLeads.length} to follow` : 'nothing to follow'}</span></h3>${body}`;
    }
  }

  /** Offered once a machine has worn enough to be worth a repair kit. */
  private mendButton(state: HudState, wear: number): [string, () => void][] {
    if (wear < WEAR_TUNING.serviceAt) return [];
    const kits = state.session.repairKits;
    return [[kits > 0 ? `Mend it (N) · ${kits} kit${kits === 1 ? '' : 's'}` : 'Mend it (N) · no kits', () => this.on.serviceMachine()]];
  }

  /** Offered once the highbanker's tank is low enough for a can to be worth pouring in. */
  private highbankerFuelButton(state: HudState): [string, () => void][] {
    const hb = state.highbanker;
    if (!hb || state.session.fuelCans <= 0 || hb.fuel > HIGHBANKER_TUNING.tank * 0.75) return [];
    return [[`Refuel (G) · ${state.session.fuelCans} can${state.session.fuelCans === 1 ? '' : 's'}`, () => this.on.refuelHighbanker()]];
  }

  /** What the crew here has made waits in their bucket and poke until the player collects it. */
  private crewBucketButton(state: HudState): [string, () => void][] {
    const site = state.crew.findSite(state.creek.id);
    if (!site || (site.poke.length === 0 && site.bucket.blackSand <= 0 && site.bucket.gold.length === 0)) return [];
    return [['Collect from the crew (W)', () => this.on.collectCrew()]];
  }

  /** Offered once the tank is low enough for a can to be worth pouring in. */
  private refuelButton(state: HudState): [string, () => void][] {
    const pump = state.sluice?.usesPump ? state.sluice.kit.pump : null;
    if (!pump || state.session.fuelCans <= 0 || pump.fuel > SLUICE_TUNING.pumpTank * 0.75) return [];
    return [[`Refuel the pump (G) · ${state.session.fuelCans} can${state.session.fuelCans === 1 ? '' : 's'}`, () => this.on.refuelPump()]];
  }

  /** What the Claims & crew tab shows, as a key so it only re-renders when something changes. */
  private officeKey(state: HudState): string {
    const { economy, crew } = state;
    const claims = economy.allClaims.map((c) => `${c.creekId}${c.status}${c.owed.toFixed(2)}${Math.round(state.region.creek(c.creekId).groundLeft * 10)}`).join();
    const workers = crew.workers.map((w) => `${w.id}@${w.siteId}`).join();
    const sites = crew.sites.map((s) => `${s.creekId}:${s.policy}:${s.jobs.join('+')}:${JOB_KINDS.map((j) => s.idle[j] ?? '').join('')}`).join();
    const town = crew.findSite(TOWN_SITE);
    const tub = town ? `${town.bucket.blackSand.toFixed(2)}/${(town.bucket.magnetite ?? 0).toFixed(2)}/${town.poke.length}` : '';
    return `${tub}:${state.session.jar.blackSand > 0.01}:${claims}:${workers}:${sites}:${JSON.stringify(crew.spares)}:${crew.returned.blackSand.toFixed(3)}:${crew.wagesOwed.toFixed(2)}:${economy.day}`;
  }

  /**
   * The claims office's ledger page: every claim with its fee and what it owes, and the payroll,
   * totalled. The money at a glance, above the crew and jobs.
   */
  private ledger(state: HudState): string {
    const { economy, crew, region } = state;
    const cents = (n: number): string => (n > 0.004 ? (Math.ceil(n * 100 - 1e-6) / 100).toFixed(2) : '—');
    const rows = economy.allClaims.filter((c) => c.status !== 'released').map((claim) => {
      const creek = region.creek(claim.creekId);
      const note = economy.isLapsed(claim)
        ? '<span class="lapsed">lapsed</span>'
        : `${traitsOf(creek.profile.site).label.toLowerCase()}, ${creek.groundLeft <= 0 ? 'worked out' : `${Math.max(10, Math.round(creek.groundLeft * 10) * 10)}% ground left`}`;
      return `<tr><td><span class="entry">${creek.profile.name}</span><span class="note">${note}</span></td><td>${claim.fee.toFixed(2)}</td><td>${cents(claim.owed)}</td></tr>`;
    });
    const home = `<tr><td><span class="entry">${region.home.profile.name}</span><span class="note">free, always yours</span></td><td>—</td><td>—</td></tr>`;
    const payroll = crew.workers.length
      ? `<tr><td><span class="entry">Wages</span><span class="note">${crew.workers.length} on the payroll${crew.dailySupplies(region) > 0 ? `, supplies $${crew.dailySupplies(region).toFixed(2)}` : ''}</span></td><td>${(crew.dailyWages + crew.dailySupplies(region)).toFixed(2)}</td><td>${cents(Math.max(0, crew.wagesOwed))}</td></tr>`
      : '';
    const fees = economy.allClaims.filter((c) => c.status === 'held').reduce((n, c) => n + c.fee, 0);
    const total = `<tr class="total"><td>Total</td><td>${(fees + crew.dailyWages + crew.dailySupplies(region)).toFixed(2)}</td><td>${cents(economy.feesOwed + Math.max(0, crew.wagesOwed))}</td></tr>`;
    return (
      `<div class="ledger"><div class="ledger-head">Claims ledger<span>Day ${economy.day}</span></div>` +
      `<table><thead><tr><th>Claim</th><th>A day</th><th>Owed</th></tr></thead><tbody>${rows.join('')}${home}${payroll}${total}</tbody></table></div>`
    );
  }

  /**
   * The crew's station in town: the settling tub (what the player leaves and couriers bring in),
   * who's working it, the magnet and finishing jobs, and gold waiting at the counter.
   */
  private townStation(state: HudState): string {
    const { crew, session } = state;
    const site = crew.findSite(TOWN_SITE);
    const tub = site?.bucket;
    const sand = tub?.blackSand ?? 0;
    const magnetite = tub && sand > 0.01 ? (tub.magnetite ?? 0) / sand : 0;
    const counter = site?.poke.length ?? 0;
    const here = crew.workersAt(TOWN_SITE);
    const policy = site?.policy ?? 'steady';
    const lines = [
      `<b>The settling tub</b> <span class="small">at the assay office</span>`,
      `<p class="small">Concentrate left here, or carried in by a courier from a claim, waits for the crew in town: the magnet strips out the magnetite, and finishing pans at the trough pan it down. Gold they find waits at the counter.</p>`,
      `<p>Tub: ${sand < 0.01 ? 'empty' : `${sand < 0.3 ? 'a little' : sand < 1 ? 'some' : 'plenty of'} black sand, ${magnetite > 0.4 ? 'mostly magnetite' : magnetite > 0.15 ? 'some magnetite left' : 'cleaned of magnetite'}`}.</p>`,
    ];
    if (counter > 0) lines.push(`<p class="found">${counter} piece${counter === 1 ? '' : 's'} of gold at the counter. <button type="button" data-action="counter">Collect</button></p>`);
    if (session.jar.blackSand > 0.01) lines.push(`<button type="button" data-action="leavejar">Leave the jar's black sand in the tub</button>`);
    lines.push(
      `<p class="small">Working it: ${here.length ? here.map(workerWords).join(', ') : 'nobody'} (room for ${STAFF_TUNING.townCrewMax}).</p>` +
        `<button type="button" data-action="send" data-role="hand" data-creek="${TOWN_SITE}" ${here.length < STAFF_TUNING.townCrewMax && crew.idleOf('hand').length > 0 ? '' : 'disabled'}>Send a hand</button> ` +
        `<button type="button" data-action="send" data-role="operator" data-creek="${TOWN_SITE}" ${here.length < STAFF_TUNING.townCrewMax && crew.idleOf('operator').length > 0 ? '' : 'disabled'}>Send an operator</button> ` +
        `<button type="button" data-action="recall" data-creek="${TOWN_SITE}" ${here.length ? '' : 'disabled'}>Call one back</button>`,
    );
    const staffed = crew.staffedJobs(TOWN_SITE);
    const jobs = TOWN_JOBS.map((job) => {
      const on = site?.jobs.includes(job) ?? false;
      const idle = site?.idle[job];
      const detail = !on ? '' : !staffed.includes(job) ? ': nobody free for it' : idle ? `: ${job === 'magnet' ? 'nothing left to strip' : 'tub empty'}` : ': working';
      return `<button type="button" class="job ${on ? 'on' : ''}" data-action="job" data-creek="${TOWN_SITE}" data-job="${job}" aria-pressed="${on}">${on ? '✓ ' : ''}${JOB_NAMES[job]}${detail}</button>`;
    });
    lines.push(`<div class="jobs">${jobs.join('')}</div>`);
    lines.push(
      `<p class="small">How they work:</p><div class="jobs policies">${(['steady', 'careful', 'push'] as const)
        .map((p) => `<button type="button" class="job ${p === policy ? 'on' : ''}" data-action="policy" data-creek="${TOWN_SITE}" data-policy="${p}" aria-pressed="${p === policy}">${POLICY_WORDS[p].name}</button>`)
        .join('')}</div><p class="small">${policy === 'careful' ? 'The magnet held high and the clump shaken back: slow, and little gold lost with the magnetite.' : policy === 'push' ? 'The magnet held right down and stripped without shaking back: quick, and fine gold goes with the magnetite.' : POLICY_WORDS[policy].note}</p>`,
    );
    return `<div class="lead">${lines.join('')}</div>`;
  }

  /** The claims office and crew: fees owed, the crew and where they are, and each claim's jobs. */
  private renderOffice(state: HudState): string {
    const { economy, crew, region, session } = state;
    const money = (n: number): string => `$${n.toFixed(2)}`;
    /** A debt as it will be paid: rounded up to the cent, so even a sliver shows as $0.01. */
    const owing = (n: number): string => `$${(Math.ceil(n * 100 - 1e-6) / 100).toFixed(2)}`;
    const parts: string[] = [];
    const m = state.money;
    const days = m.daysToShutdown === null ? '' : m.daysToShutdown < 0.5 ? 'less than half a day' : `about ${Math.round(m.daysToShutdown * 2) / 2} days`;
    const moneyNote: Record<FinancialState, string> = {
      healthy: '',
      strained: `<p class="warn">Money's tight: you owe ${owing(m.owed)} and have ${money(session.cash)}. No hiring or big purchases until you can cover it; everything else carries on.</p>`,
      insolvent: `<p class="warn"><b>Insolvent.</b> You're behind and can't pay what you owe (${owing(m.owed)}). Your crew has walked off, and nothing but fuel can be bought. Pay it off within ${days} or your claims will be shut down: your machines packed, crew gear sold for scrap, and you back at the Home Creek. Sell some gold.</p>`,
      recovering: `<p class="warn"><b>Recovering.</b> You still owe ${owing(m.owed)} from before the shutdown. Pan and sell to pay it off; buying and hiring open up again once it's clear. Nothing more will be taken.</p>`,
    };
    if (m.state !== 'healthy') parts.push(moneyNote[m.state]);
    const owed = economy.feesOwed + Math.max(0, crew.wagesOwed);
    // The state notes above already say how much is owed when money is short.
    if (owed > 0 && m.state === 'healthy') {
      parts.push(
        session.cash >= 0.01
          ? '<p class="small">What you owe is paid from your cash automatically while you\'re in town.</p>'
          : `<p class="warn">You owe ${owing(owed)} and have no cash. Sell some gold at the counter: it's paid automatically as soon as you have the money.</p>`,
      );
    }
    parts.push(this.ledger(state));
    parts.push(`<p class="small">Fees and wages come out of your cash whenever you're in town, as far as it goes.</p>`);

    // The crew as a whole.
    const crewLines = [
      `<b>Your crew</b> <span class="small">${crew.workers.length ? `${crew.workers.length} on the payroll · ${money(crew.dailyWages)} a day` : 'nobody yet'}</span>`,
      '<p class="small">Your crew works your stretches while you are elsewhere: slower and less careful than you, so they buy you time, not gold. <b>Hands</b> pan, rock, haul, screen loads, prospect and finish concentrate. <b>Operators</b> also run the sluice, highbanker, trommel and drywasher. Send them to a stretch and switch on the jobs you want there; jobs are filled in the order you switched them on. What they make waits for you to collect at the stretch.</p>',
    ];
    if (crew.wagesOwed > 0) crewLines.push(`<p class="small">Wages owed: ${owing(crew.wagesOwed)}.</p>`);
    // The day's applicants, each with their own skill, pace and asking wage.
    crewLines.push('<h4 class="shelf">Looking for work today</h4>');
    if (crew.applicants.length === 0) crewLines.push('<p class="small">Nobody else today. Others turn up tomorrow.</p>');
    for (const a of crew.applicants) {
      const ok = state.money.canHire && session.cash >= a.wage;
      crewLines.push(
        `<div class="applicant"><div><b>${a.name}</b> <span class="small">${ROLE_WORDS[a.role]}</span><p class="small">${SKILL_WORDS[a.skill]}, ${PACE_WORDS[a.pace]}</p></div>` +
          `<button type="button" data-action="hire" data-applicant="${a.id}" ${ok ? '' : 'disabled'}>Hire, $${a.wage} a day</button></div>`,
      );
    }
    crewLines.push(
      '<p class="small">The first day is paid up front. Seasoned hands lose less gold and ask more; green ones come cheap and lose more. Quick ones get through more ground. A <b>foreman</b> takes no job: they lift the whole crew at one stretch, as far as your field notes cover the ground, and dig where your notes say the colour is.</p>',
    );
    const idle = crew.idleWorkers;
    if (idle.length) {
      crewLines.push(
        `<p class="small">Waiting in town: ${idle.map((w) => `${workerWords(w)} <button type="button" class="link" data-action="dismiss" data-worker="${w.id}">let go</button>`).join(' · ')}</p>`,
      );
    }
    const spares = CREW_GEAR.filter(([m]) => crew.spares[m] > 0).map(([m, name]) => `${crew.spares[m]} ${name.replace('Crew ', '')}`);
    if (spares.length) crewLines.push(`<p class="small">Spare crew gear: ${spares.join(', ')}.</p>`);
    if (crew.returned.blackSand > 0 || crew.returned.gold.length > 0) {
      crewLines.push('<p class="small">Your crew brought concentrate back to town.</p><button type="button" data-action="returned">Wash it into your jar</button>');
    }
    parts.push(`<div class="lead">${crewLines.join('')}</div>`);
    parts.push(this.townStation(state));

    // Each claim: its hands and jobs, fees, release. Released claims fold away at the end.
    const released = economy.allClaims.filter((c) => c.status === 'released');
    const claims = [...economy.allClaims.filter((c) => c.status !== 'released'), ...(this.showReleased ? released : [])].map((claim) => {
      const creek = region.creek(claim.creekId);
      const name = creek.profile.name;
      const kind = traitsOf(creek.profile.site).label.toLowerCase();
      const status =
        claim.status === 'released'
          ? '<span class="dud">Released.</span>'
          : economy.isLapsed(claim)
            ? `<span class="warn">Lapsed: owes ${owing(claim.owed)}.</span>`
            : claim.owed > 0
              ? `Owes ${owing(claim.owed)}.`
              : '<span class="found">Paid up.</span>';
      const ground = `<p class="small">${groundWords(creek.groundLeft)}</p>`;
      if (claim.status === 'released') {
        return `<div class="lead"><b>${name}</b> <span class="small">${kind} · $${claim.fee} a day</span><p>${status}</p>${ground}<button type="button" data-action="restake" data-creek="${claim.creekId}" ${state.money.canRestake && session.cash >= ECONOMY_TUNING.restakeFee ? '' : 'disabled'}>Re-stake for $${ECONOMY_TUNING.restakeFee}</button></div>`;
      }
      const cap = traitsOf(creek.profile.site).crewMax;
      const here = crew.workersAt(claim.creekId);
      const site = crew.findSite(claim.creekId);
      const staffed = crew.staffedJobs(claim.creekId);
      // Fee, what's owed and ground left are in the ledger above; here is the work.
      const lines = [`<b>${name}</b> <span class="small">${kind}</span>${economy.isLapsed(claim) ? `<p>${status}</p>` : ''}`];
      const diggers = crew.diggersAt(claim.creekId);
      const foreman = crew.foremanAt(claim.creekId);
      const room = diggers.length < cap && economy.canWork(claim.creekId);
      const lift = crew.foremanLift(creek);
      lines.push(
        `<p class="small">Crew here: ${diggers.length ? diggers.map(workerWords).join(', ') : 'none'} (room for ${cap}).</p>` +
          (foreman ? `<p class="small">Foreman: ${workerWords(foreman)}. ${liftWords(lift)}</p>` : '') +
          `<button type="button" data-action="send" data-role="hand" data-creek="${claim.creekId}" ${room && crew.idleOf('hand').length > 0 ? '' : 'disabled'}>Send a hand</button> ` +
          `<button type="button" data-action="send" data-role="operator" data-creek="${claim.creekId}" ${room && crew.idleOf('operator').length > 0 ? '' : 'disabled'}>Send an operator</button> ` +
          (crew.idleOf('foreman').length > 0 && !foreman
            ? `<button type="button" data-action="send" data-role="foreman" data-creek="${claim.creekId}" ${economy.canWork(claim.creekId) ? '' : 'disabled'}>Send a foreman</button> `
            : '') +
          `<button type="button" data-action="recall" data-creek="${claim.creekId}" ${here.length ? '' : 'disabled'}>Call one back</button>`,
      );
      // Job toggles: on and staffed, on and waiting for a hand, or off.
      const jobs = JOB_KINDS.filter((job) => jobFits(job, creek)).map((job) => {
        const on = site?.jobs.includes(job) ?? false;
        const idleWhy = site?.idle[job];
        const detail = !on
          ? ''
          : !staffed.includes(job)
            ? OPERATOR_JOBS.includes(job)
              ? ': needs an operator'
              : ': nobody free for it'
            : idleWhy
              ? `: ${IDLE_WORDS[idleWhy]}`
              : !crew.jobReady(creek, job, session)
                ? `: ${IDLE_WORDS.noMachine}`
                : site?.policy === 'prepare' && DIGGING_JOBS.includes(job)
                  ? ': clearing ground'
                  : ': working';
        return `<button type="button" class="job ${on ? 'on' : ''}" data-action="job" data-creek="${claim.creekId}" data-job="${job}" aria-pressed="${on}">${on ? '✓ ' : ''}${JOB_NAMES[job]}${detail}</button>`;
      });
      lines.push(`<div class="jobs">${jobs.join('')}</div>`);
      // One setting for how the whole crew here works.
      const policy = site?.policy ?? 'steady';
      lines.push(
        `<p class="small">How they work:</p><div class="jobs policies">${CREW_POLICIES.map(
          (p) => `<button type="button" class="job ${p === policy ? 'on' : ''}" data-action="policy" data-creek="${claim.creekId}" data-policy="${p}" aria-pressed="${p === policy}">${POLICY_WORDS[p].name}</button>`,
        ).join('')}</div><p class="small">${POLICY_WORDS[policy].note}</p>`,
      );
      if (here.length > 0) {
        const days = crewGroundLeft(crew, creek);
        if (Number.isFinite(days)) {
          lines.push(`<p class="small">${days <= 0 ? 'The ground is worked out.' : days < 0.5 ? 'Less than half a day of ground left at their pace.' : `About ${Math.round(days * 2) / 2} days of ground left at their pace.`}</p>`);
        }
        const take = estimateHandTake(creek, crew.policyAt(claim.creekId));
        if (crew.policyAt(claim.creekId) !== 'prepare') lines.push(
          take
            ? `<p class="small">From your field notes, an operator on a machine here might bring in very roughly ${money(Math.max(0, take.low))} to ${money(take.high)} a day, against ${money(STAFF_TUNING.wage.operator)} in wages. Hand work brings in much less.</p>`
            : '<p class="small">Pan this stretch yourself to judge whether hands will pay here.</p>',
        );
      }
      lines.push(`<button type="button" data-action="release" data-creek="${claim.creekId}">Release</button>`);
      return `<div class="lead">${lines.join('')}</div>`;
    });
    if (released.length) {
      claims.push(
        `<button type="button" class="fold" data-action="released" aria-expanded="${this.showReleased}">${this.showReleased ? 'Hide' : 'Show'} released claims (${released.length})</button>`,
      );
      // Open, the released claims sit below the toggle rather than above it.
      if (this.showReleased) claims.push(...claims.splice(claims.length - 1 - released.length, released.length));
    }
    parts.push(
      claims.length
        ? `${claims.join('')}<p class="small">Releasing a claim writes off what it owes and brings its crew back to town. A claim more than ${ECONOMY_TUNING.graceDays} days behind lapses and can't be worked until it's paid.</p>`
        : '<p class="small">No claims yet. Stretches you find are staked for you, at a small fee a day.</p>',
    );
    return parts.join('');
  }

  /** In town, or on a stretch the player found (never the Home Creek), with something in the jar. */
  private magnetButton(state: HudState): [string, () => void][] {
    const { session, mode } = state;
    const place = mode === 'town' || (mode === 'bank' && state.region.allows(state.creek, 'magnet'));
    if (!place || !session.owns('magnet') || session.jar.blackSand < MIN_CONCENTRATE) return [];
    return [['Clean the jar with the magnet (X)', () => this.on.openMagnet()]];
  }

  private jarButton(session: PanningSession): [string, () => void][] {
    return session.canPanConcentrate && this.state?.canPan !== false ? [['Pan the concentrate jar (J)', () => this.on.panConcentrate()]] : [];
  }

  private handleKey(key: string, repeat = false): void {
    const state = this.state;
    if (!state) return;
    // The tablet sits over everything: while it's open, keys are for it.
    if (this.tabletOpen) {
      if (key === 'escape' || key === 'o') this.closeTablet();
      return;
    }
    if (key === 'o' && (state.mode === 'creek' || state.mode === 'region' || state.mode === 'town')) return this.openTablet();
    const phase = state.session.pan?.phase;
    if (state.mode === 'creek') {
      const n = Number(key);
      if (Number.isInteger(n) && n >= 1) this.on.pickSpot(n - 1);
      else if (key === 't') this.on.walkToTown();
      else if (key === 'w') this.on.collectCrew();
      else if (key === 'm' || key === 'escape') this.on.openRegion();
    } else if (state.mode === 'region') {
      if (key === 'escape') this.on.walkCreek();
      else if (key === 't') this.on.walkToTown();
      else if (key === '+' || key === '=') this.on.zoomMap(1.3);
      else if (key === '-' || key === '_') this.on.zoomMap(1 / 1.3);
      else if (key === '0') this.on.zoomMap(0);
    } else if (state.mode === 'rocker') {
      if (key === 'n') return this.on.serviceMachine();
      if (key === ' ' && !repeat) this.on.rock();
      else if (key === 'l') this.on.ladle();
      else if (key === 'e') this.on.fetchWater();
      else if (key === 't') this.on.tipRocker();
      else if (key === 'c') this.on.cleanUpRocker();
      else if (key === 'h') this.on.shovel('rocker');
      else if (key === 'b') this.on.pourIntoRocker();
      else if (key === 'j') this.on.panConcentrate();
      else if (key === 'escape') this.on.backToHole();
    } else if (state.mode === 'magnet') {
      if (key === 'b') this.on.shakeClump();
      else if (key === 't') this.on.stripClump();
      else if (key === 'escape') this.on.closeMagnet();
    } else if (state.mode === 'town') {
      if (key === 'x') this.on.openMagnet();
      else if (key === 'j') this.on.panConcentrate();
      else if (key === 'w') this.on.collectCounter();
      else if (key === 's') this.on.sell();
      else if (key === 'escape' || key === 'm') this.on.openRegion();
    } else if (state.mode === 'pan') {
      if (key === 'r' && phase === 'working') this.on.reveal();
      else if (key === 'c' && phase === 'revealed') this.on.collect(true);
      else if (key === 'f' && phase === 'revealed') this.on.snuff();
      else if (key === 'd' && phase === 'revealed') this.on.collect(false);
      else if ((key === 'n' || key === 'enter') && phase === 'emptied') this.on.backToHole();
      else if (key === 'j' && phase === 'emptied') this.on.panConcentrate();
      else if (key === 'b' && phase === 'emptied' && state.classifier) this.on.panBucket();
      else if (key === 'escape') this.on.backToHole();
    } else if (state.mode === 'sluice') {
      if (key === 'r') this.on.rakeSluice();
      else if (key === 'g') this.on.refuelPump();
      else if (key === 'w') this.on.collectCrew();
      else if (key === 'f' && !state.cleaningOut) this.on.shovel('sluice');
      else if (key === 'c' && !state.cleaningOut) this.on.startCleanout();
      else if (key === 'l' && state.cleaningOut) this.on.liftMat();
      else if (key === 'j') this.on.panConcentrate();
      else if (key === 'n') this.on.serviceMachine();
      else if (key === 'escape') this.on.backToHole();
    } else if (state.mode === 'classifier' && state.classifier) {
      if (key === 't' && state.classifier.hasLoad) this.on.tipOff();
      else if (key === 'k' && !state.classifier.hasLoad) this.on.shovel('classifier');
      else if (key === 'p') this.on.panBucket();
      else if (key === 'f' && state.sluice) this.on.pourIntoSluice();
      else if (key === 'escape') this.on.backToHole();
    } else if (state.mode === 'drywasher') {
      if (key === 'd') this.on.shakeOutDust();
      else if (key === 'k') this.on.knockScreen();
      else if (key === 't') this.on.tipDrywasher();
      else if (key === 'c') this.on.pullDrawer();
      else if (key === 'y') this.on.shovel('drywasher');
      else if (key === 'b') this.on.pourIntoDrywasher();
      else if (key === 'n') this.on.serviceMachine();
      else if (key === 'j') this.on.panConcentrate();
      else if (key === 'escape') this.on.backToHole();
    } else if (state.mode === 'highbanker' && state.highbanker) {
      const hb = state.highbanker;
      if (key === 'p') this.on.primePump();
      else if (key === 'e') this.on.toggleEngine();
      else if (key === 'r') this.on.clearHighbanker();
      else if (key === 'f' && !hb.rinsing) this.on.shovel('highbanker');
      else if (key === 'b') this.on.pourIntoHighbanker();
      else if (key === 'g') this.on.refuelHighbanker();
      else if (key === 'c' && !hb.rinsing) this.on.highbankerCleanout();
      else if (key === 'l' && hb.rinsing) this.on.liftHighbankerMat();
      else if (key === 'n') this.on.serviceMachine();
      else if (key === 'j') this.on.panConcentrate();
      else if (key === 'escape') this.on.backToHole();
    } else if (state.mode === 'trommel' && state.trommel) {
      const t = state.trommel;
      if (key === 'e') this.on.toggleTrommel();
      else if (key === 'r') this.on.clearTrommel();
      else if (key === 'f' && !t.rinsing) this.on.shovel('trommel');
      else if (key === 'g') this.on.refuelTrommel();
      else if (key === 'c' && !t.rinsing) this.on.trommelCleanout();
      else if (key === 'l' && t.rinsing) this.on.liftTrommelMat();
      else if (key === 'n') this.on.serviceMachine();
      else if (key === 'j') this.on.panConcentrate();
      else if (key === 'escape') this.on.backToHole();
    } else if (state.mode === 'bank') {
      if (key === 'f' && state.trommel) this.on.shovel('trommel');
      else if (key === 'v' && state.trommel) this.on.openTrommel();
      else if (key === 'k' && state.classifier) this.on.shovel('classifier');
      else if (key === 'c' && state.classifier) this.on.openClassifier();
      else if (key === 'f' && state.sluice) this.on.shovel('sluice');
      else if (key === 'v' && state.sluice) this.on.openSluice();
      else if (key === 'g' && state.sluice) this.on.refuelPump();
      else if (key === 'f' && state.highbanker) this.on.shovel('highbanker');
      else if (key === 'y' && state.drywasher) this.on.shovel('drywasher');
      else if (key === 'd' && state.drywasher) this.on.openDrywasher();
      else if (key === 'u' && state.tub) this.on.changeTubWater();
      else if (key === 'v' && state.highbanker) this.on.openHighbanker();
      else if (key === 'g' && state.highbanker) this.on.refuelHighbanker();
      else if (key === 'w') this.on.collectCrew();
      else if (key === 'p') this.on.shovel('pan');
      else if (key === 't') this.on.shovel('spoil');
      else if (key === 'b') this.on.pry();
      else if (key === 'a') this.on.bail();
      else if (key === 'escape') this.on.walkCreek();
      else if (key === 'j') this.on.panConcentrate();
      else if (key === 'x') this.on.openMagnet();
      else if (key === 'h' && state.rocker) this.on.shovel('rocker');
      else if (key === 'o' && state.rocker) this.on.openRocker();
    }
  }

  openTablet(): void {
    this.tabletOpen = true;
    this.tablet.hidden = false;
    this.tabletKey = '';
  }

  closeTablet(): void {
    this.tabletOpen = false;
    this.tablet.hidden = true;
  }

  private renderTablet(state: HudState): void {
    if (!this.tabletOpen) return;
    const { crew, economy, region, session } = state;
    const clock = `Day ${economy.day} · ${economy.timeOfDay} · $${session.cash.toFixed(2)}`;
    if (this.tabletClock.textContent !== clock) this.tabletClock.textContent = clock;
    const playerAt = state.mode === 'town' || state.mode === 'region' ? null : state.creek.id;
    const world = { crew, economy, session, playerAt };
    const views = economy.allClaims
      .filter((c) => c.status === 'held')
      .map((c) => claimOverview(region.creek(c.creekId), c, world))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || region.creek(a.creekId).profile.name.localeCompare(region.creek(b.creekId).profile.name));
    const key = `${this.tabletTab}:${this.tabletSelected}:${clock}:${views.map((v) => `${v.creekId}${v.status}${v.warnings.length}${v.jobs.map((j) => j.state).join('')}${Math.round(v.groundLeft * 10)}${v.waiting.gold}${v.waiting.sand.toFixed(1)}`).join()}:${crew.workers.map((w) => `${w.id}@${w.siteId}`).join()}:${state.money.state}:${session.vial.length}:${session.jar.blackSand.toFixed(2)}:${session.fuelCans}:${OUTFITTER.map((g) => (session.owns(g.id) ? 1 : 0)).join('')}:${JSON.stringify(session.sluicePlace)}:${JSON.stringify(session.highbankerPlace)}:${region.leads.map((l) => `${l.id}${l.status}`).join()}:${region.offers.length}:${Math.round(region.home.groundLeft * 20)}:${crew.returned.blackSand.toFixed(2)}`;
    if (key === this.tabletKey) return;
    this.tabletKey = key;
    for (const tab of this.tablet.querySelectorAll<HTMLElement>('[data-ttab]')) tab.classList.toggle('active', tab.dataset.ttab === this.tabletTab);
    const money = (n: number): string => `$${n.toFixed(2)}`;
    const name = (id: number): string => region.creek(id).profile.name;

    if (this.tabletTab === 'overview') {
      this.tabletBody.innerHTML = this.tabletOverview(state, views);
      return;
    }

    if (this.tabletTab === 'leads') {
      const leads = [...region.leads].reverse().filter((l) => l.status === 'open').map((lead) => {
        const status =
          lead.status === 'open' ? '<span class="small">Not followed yet: follow it from the region map.</span>'
          : lead.status === 'dud' ? '<span class="dud">Nothing there.</span>'
          : '<span class="found">Found. It is on the map.</span>';
        return `<div class="tablet-group">${leadHeader(lead)}${status}</div>`;
      });
      const offers = region.offers.length ? `<p class="small">${region.offers.length} lead${region.offers.length === 1 ? '' : 's'} for sale in town.</p>` : '';
      const old = region.leads.length - leads.length;
      const oldLine = old ? `<p class="small">${old} old lead${old === 1 ? '' : 's'} (found or duds) kept at the back of the notebook, on the region map.</p>` : '';
      this.tabletBody.innerHTML =
        offers + (leads.join('') || `<p class="small">${region.leads.length ? 'Nothing left to follow.' : 'No leads yet. Pan along the creek and watch where the colour gets stronger, look for clues while digging, or buy a lead in town.'}</p>`) + oldLine;
      return;
    }

    if (this.tabletTab === 'claims') {
      const home = region.home;
      const homeCard =
        `<button type="button" class="tablet-card is-home ${this.tabletSelected === home.id ? 'selected' : ''}" data-claim="${home.id}">` +
        `<span class="chip">Free · always yours</span><b>${home.profile.name}</b>` +
        `<span class="small">home creek · shovel and pan · ${Math.round(home.groundLeft * 10) * 10}% ground</span></button>`;
      const cards = views.map((v) => {
        const creek = region.creek(v.creekId);
        const jobsOn = v.jobs.length;
        const summary = v.crew.length ? `${v.crew.length} crew · ${jobsOn} job${jobsOn === 1 ? '' : 's'}` : 'No crew';
        return (
          `<button type="button" class="tablet-card is-${v.status} ${this.tabletSelected === v.creekId ? 'selected' : ''}" data-claim="${v.creekId}">` +
          `<span class="chip ${v.status}">${HEALTH_WORDS[v.status]}</span><b>${creek.profile.name}</b>` +
          `<span class="small">${traitsOf(creek.profile.site).label.toLowerCase()} · ${summary} · ${Math.round(v.groundLeft * 10) * 10}% ground</span>` +
          `${v.warnings[0] ? `<span class="small warn">${v.warnings[0]}</span>` : ''}</button>`
        );
      });
      const selected = views.find((v) => v.creekId === this.tabletSelected);
      const sheet = selected
        ? this.claimSheet(selected, state)
        : this.tabletSelected === home.id
          ? `<div class="tablet-sheet"><b>${home.profile.name}</b> <span class="small">home creek</span><p>No fee, no claim, no crew: shovel and pan only, and always there to come back to.</p>` +
            `<p>${groundWords(home.groundLeft)} Floods and the creek's slow trickle bring fresh gravel down over time.</p><button type="button" data-go="${home.id}">Walk there</button></div>`
          : `<p class="small">${views.length ? 'Tap a claim to read it.' : 'No claims held yet. Follow a lead and stake what you find.'}</p>`;
      this.tabletBody.innerHTML = `<div class="tablet-cards">${cards.join('')}${homeCard}</div>${sheet}`;
      return;
    }

    if (this.tabletTab === 'crew') {
      const sites = views.filter((v) => v.crew.length > 0);
      const groups = sites.map((v) => {
        const roles = (['foreman', 'operator', 'hand'] as const).map((r) => ({ r, n: v.crew.filter((c) => c.role === r).length })).filter((x) => x.n > 0);
        const flags = v.jobs.filter((j) => j.state === 'needsOperator' || j.state === 'noOne').map((j) => `${JOB_NAMES[j.job]} ${j.state === 'needsOperator' ? 'needs an operator' : 'has nobody on it'}`);
        const idle = v.jobs.filter((j) => j.state !== 'working' && j.state !== 'standingBack' && j.state !== 'noOne' && j.state !== 'needsOperator').length;
        return (
          `<div class="tablet-group"><b>${name(v.creekId)}</b> <span class="small">${roles.map((x) => `${x.n} ${x.r}${x.n === 1 ? '' : 's'}`).join(', ')} · ${money(v.wagesPerDay)} a day</span>` +
          `<p class="small">${v.crew.map(workerWords).join(', ')}</p>` +
          (v.hasForeman ? `<p class="small">${liftWords(v.foremanLift)}</p>` : '') +
          `<p class="small">Jobs: ${v.jobs.length ? v.jobs.map((j) => JOB_NAMES[j.job]).join(', ') : 'none switched on'}${idle ? ` · ${idle} idle` : ''}</p>` +
          `${flags.map((f) => `<p class="small warn">${f}.</p>`).join('')}</div>`
        );
      });
      const waiting = crew.idleWorkers;
      const spares = CREW_GEAR.filter(([m]) => crew.spares[m] > 0).map(([m, label]) => `${crew.spares[m]} ${label.replace('Crew ', '')}`);
      if (crew.workers.length === 0) {
        this.tabletBody.innerHTML =
          `<p>No crew hired.</p><p class="small">Hands ($${STAFF_TUNING.wage.hand} a day) and operators ($${STAFF_TUNING.wage.operator} a day) are hired in town, in Claims & crew, and sent to a staked stretch. They work while you're somewhere else: they buy you time, not better recovery.</p>` +
          (CREW_GEAR.some(([m]) => crew.spares[m] > 0) ? `<p class="small">Spare crew gear: ${CREW_GEAR.filter(([m]) => crew.spares[m] > 0).map(([m, label]) => `${crew.spares[m]} ${label.replace('Crew ', '')}`).join(', ')}.</p>` : '');
        return;
      }
      this.tabletBody.innerHTML =
        (groups.join('') || '<p class="small">Nobody is out at a claim.</p>') +
        (crew.workersAt(TOWN_SITE).length
          ? `<div class="tablet-group"><b>At the settling tub</b><p class="small">${crew.workersAt(TOWN_SITE).map(workerWords).join(', ')}</p><p class="small">Jobs: ${crew.findSite(TOWN_SITE)?.jobs.map((j) => JOB_NAMES[j]).join(', ') || 'none switched on'}</p></div>`
          : '') +
        `<div class="tablet-group"><b>In town</b><p class="small">${waiting.length ? waiting.map(workerWords).join(', ') : 'Nobody waiting.'}</p>${spares.length ? `<p class="small">Spare crew gear: ${spares.join(', ')}.</p>` : ''}</div>`;
      return;
    }

    // Costs.
    const c = costOverview(state);
    const burn = c.feesPerDay + c.wagesPerDay + c.suppliesPerDay;
    const m = state.money;
    const runway = burn > 0 ? session.cash / burn : Infinity;
    const stateLine =
      m.state === 'healthy'
        ? '<p class="found">Books square.</p>'
        : m.state === 'strained'
          ? '<p class="warn">Money tight: you owe more than you have on hand.</p>'
          : m.state === 'insolvent'
            ? `<p class="warn"><b>Insolvent.</b> Shutdown in ${m.daysToShutdown === null || m.daysToShutdown < 0.5 ? 'under half a day' : `about ${Math.round(m.daysToShutdown * 2) / 2} days`} unless you pay up.</p>`
            : '<p class="warn"><b>Recovering</b> from a shutdown: pay off what\'s left.</p>';
    const owedRows = economy.allClaims
      .filter((cl) => cl.owed > 0)
      .map((cl) => `<tr><td>${name(cl.creekId)}${economy.isLapsed(cl) ? ' <span class="warn">(lapsed)</span>' : ''}</td><td>${money(Math.ceil(cl.owed * 100 - 1e-6) / 100)}</td></tr>`);
    this.tabletBody.innerHTML =
      stateLine +
      `<table class="tablet-table">` +
      `<tr><td>Cash on hand</td><td>${money(session.cash)}</td></tr>` +
      `<tr><td>Claim fees a day</td><td>${money(c.feesPerDay)}</td></tr>` +
      `<tr><td>Wages a day</td><td>${money(c.wagesPerDay)}</td></tr>` +
      (c.suppliesPerDay > 0 ? `<tr><td>Supplies a day</td><td>${money(c.suppliesPerDay)} <span class="small">(remote crews)</span></td></tr>` : '') +
      `<tr><td><b>Costs a day</b></td><td><b>${money(burn)}</b></td></tr>` +
      `<tr><td>Cash lasts</td><td>${burn <= 0 ? '—' : runway < 0.5 ? 'under half a day' : `about ${Math.round(runway * 2) / 2} days`}</td></tr>` +
      `</table>` +
      `<p class="small">Owed now: ${money(c.feesOwed + c.wagesOwed)} (fees ${money(c.feesOwed)}, wages ${money(c.wagesOwed)}). Paid from your cash in town.</p>` +
      (owedRows.length ? `<table class="tablet-table">${owedRows.join('')}</table>` : '');
  }

  /** The front page: where things stand, what you're carrying, and what needs you. */
  private tabletOverview(state: HudState, views: readonly ClaimOverview[]): string {
    const { session, region, crew, economy } = state;
    const money = (n: number): string => `$${n.toFixed(2)}`;
    const where =
      state.mode === 'town' ? 'In town' : state.mode === 'region' ? 'Looking over the region map' : `At ${state.creek.profile.name}`;
    const vial = session.vial.length
      ? `${session.vialMg.toFixed(1)} mg in ${session.vial.length} piece${session.vial.length === 1 ? '' : 's'}, worth about ${money(quoteSale(session.vial).total)} to the buyer`
      : 'empty';
    const jarShare = session.jarCapacity > 0 ? session.jar.blackSand / session.jarCapacity : 0;
    const jar =
      session.jar.blackSand < 0.01 ? 'empty'
      : `${jarShare > 0.9 ? 'full' : jarShare > 0.6 ? 'mostly full' : jarShare > 0.3 ? 'about half full' : 'a little'} of black sand; its gold is unknown until it's panned`;
    const owned = OUTFITTER.filter((g) => session.owns(g.id)).map((g) => {
      if (g.id === 'sluice' && session.sluicePlace) return `${g.name} (set up at ${region.creek(session.sluicePlace.creekId).profile.name})`;
      if (g.id === 'highbanker' && session.highbankerPlace) return `${g.name} (set up at ${region.creek(session.highbankerPlace.creekId).profile.name})`;
      return g.name;
    });
    const gear =
      ['Shovel', 'Pan', ...owned].join(', ') +
      (session.fuelCans ? `; ${session.fuelCans} fuel can${session.fuelCans === 1 ? '' : 's'}` : '') +
      (session.repairKits ? `; ${session.repairKits} repair kit${session.repairKits === 1 ? '' : 's'}` : '');
    const held = views.length;
    const openLeads = region.leads.filter((l) => l.status === 'open').length;
    const wages = crew.dailyWages;
    const fees = economy.allClaims.filter((c) => c.status === 'held').reduce((n, c) => n + c.fee, 0);

    const attention: string[] = [];
    if (state.money.state === 'insolvent') attention.push('<b>Insolvent:</b> get to town with cash before the operation is shut down.');
    else if (state.money.state === 'strained') attention.push('Money is tight: you owe more than you have on hand.');
    else if (state.money.state === 'recovering') attention.push('Recovering from a shutdown: pay off what’s left in town.');
    for (const v of views) for (const w of v.warnings.slice(0, v.status === 'critical' ? 2 : 1)) attention.push(`<b>${region.creek(v.creekId).profile.name}:</b> ${w}`);
    const idle = crew.idleWorkers.length;
    if (idle) attention.push(`${idle} of your crew ${idle === 1 ? 'is' : 'are'} waiting in town for a stretch to work.`);
    if (crew.returned.blackSand > 0.01) attention.push('Your crew left concentrate in town to wash into your jar.');
    const counter = crew.findSite(TOWN_SITE)?.poke.length ?? 0;
    if (counter > 0) attention.push(`${counter} piece${counter === 1 ? '' : 's'} of gold waiting at the counter in town.`);
    if (session.jarSpace <= 0.01 && session.jar.blackSand > 0) attention.push('The jar is full: pan it down, or clean it with the magnet.');

    return (
      `<table class="tablet-table">` +
      `<tr><td>Where</td><td>${where}</td></tr>` +
      `<tr><td>Cash</td><td>${money(session.cash)}${state.money.state === 'healthy' ? '' : ` <span class="warn">(${state.money.state})</span>`}</td></tr>` +
      `<tr><td>Vial</td><td>${vial}</td></tr>` +
      `<tr><td>Jar</td><td>${jar}</td></tr>` +
      `<tr><td>Gear</td><td>${gear}</td></tr>` +
      `<tr><td>Claims</td><td>${held ? `${held} held, ${money(fees)} a day in fees` : 'none held'} · the Home Creek is free</td></tr>` +
      `<tr><td>Crew</td><td>${crew.workers.length ? `${crew.workers.length} hired, ${money(wages)} a day` : 'none hired'}</td></tr>` +
      `<tr><td>Leads</td><td>${openLeads ? `${openLeads} to follow` : 'none open'}${region.offers.length ? `, ${region.offers.length} for sale in town` : ''}</td></tr>` +
      `<tr><td>Pans worked</td><td>${session.pansWorked}, ${money(session.earned)} earned all told</td></tr>` +
      `</table>` +
      `<h4>Needs you</h4>` +
      (attention.length ? `<ul class="warnings">${attention.map((a) => `<li>${a}</li>`).join('')}</ul>` : '<p class="found">Nothing pressing.</p>') +
      (this.messages.length
        ? `<h4>Recent</h4><ul class="messages">${this.messages.map((m) => `<li><span class="small">${m.when}</span>${escapeHtml(forInput(m.text))}</li>`).join('')}</ul>`
        : '')
    );
  }

  /** The detail sheet for one claim: everything on the card, spelled out. */
  private claimSheet(v: ClaimOverview, state: HudState): string {
    const creek = state.region.creek(v.creekId);
    const money = (n: number): string => `$${n.toFixed(2)}`;
    const jobs = v.jobs.length
      ? v.jobs.map((j) => `<li>${JOB_NAMES[j.job]}: ${JOB_STATE_WORDS[j.state] ?? j.state}</li>`).join('')
      : '<li>No jobs switched on.</li>';
    const days = !Number.isFinite(v.daysLeft) ? 'nobody digging' : v.daysLeft < 0.5 ? 'under half a day at their pace' : `about ${Math.round(v.daysLeft * 2) / 2} days at their pace`;
    const take = v.take
      ? `very roughly ${money(Math.max(0, v.take.low))} to ${money(v.take.high)} a day for each hand digging, from your field notes`
      : 'no field notes here yet';
    const sand = v.waiting.sand > 3 ? 'nearly full' : v.waiting.sand > 1.5 ? 'half full' : v.waiting.sand > 0.01 ? 'some' : 'empty';
    return (
      `<div class="tablet-sheet"><b>${creek.profile.name}</b> <span class="small">${traitsOf(creek.profile.site).label.toLowerCase()}</span>` +
      `${v.warnings.length ? `<ul class="warnings">${v.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>` : '<p class="found">Nothing needs you here.</p>'}` +
      `<table class="tablet-table">` +
      `<tr><td>Crew</td><td>${v.crew.length ? v.crew.map(workerWords).join(', ') : 'none'}</td></tr>` +
      `<tr><td>Working</td><td>${POLICY_WORDS[v.policy].name.toLowerCase()} <span class="small">(set in town)</span></td></tr>` +
      `<tr><td>Costs a day</td><td>${money(v.wagesPerDay)} wages${v.suppliesPerDay > 0 ? ` + ${money(v.suppliesPerDay)} supplies` : ''} + ${money(v.feePerDay)} fee${v.burnsFuel ? ' + fuel' : ''}</td></tr>` +
      (v.machineWear > 0 ? `<tr><td>Machines</td><td>${wearWord(v.machineWear)}</td></tr>` : '') +
      `<tr><td>Ground left</td><td>about ${Math.round(v.groundLeft * 10) * 10}%, ${days}</td></tr>` +
      `<tr><td>Take</td><td>${take}</td></tr>` +
      `<tr><td>Waiting to collect</td><td>crew bucket ${sand}${v.waiting.gold ? `, ${v.waiting.gold} piece${v.waiting.gold === 1 ? '' : 's'} of gold in the poke` : ''}</td></tr>` +
      `</table><ul class="jobs-list">${jobs}</ul>` +
      `<button type="button" data-go="${v.creekId}">Walk there</button></div>`
    );
  }

  /**
   * Where the inspection panel reaches on screen (right and bottom edges, in CSS pixels), or null
   * when it's closed: machine views keep their controls clear of it.
   */
  inspectBounds(): { readonly right: number; readonly bottom: number } | null {
    if (this.inspect.hidden) return null;
    const r = this.inspect.getBoundingClientRect();
    return r.width > 0 ? { right: r.right, bottom: r.bottom } : null;
  }

  private renderInspect(state: HudState): void {
    const { mode, session, creek, spot, events } = state;
    const avg = session.pansWorked > 0 ? (session.vialMg / session.pansWorked).toFixed(1) : '–';
    const common: [string, string][] = [
      ['Pans worked', String(session.pansWorked)],
      ['Colour per pan', `${avg} mg`],
    ];
    let rows: [string, string][] = [];
    const pan = session.pan;
    if (mode === 'pan' && pan) {
      const water = pan.turbidity > 0.3 ? 'muddy' : pan.waterMurk > 0.5 ? 'muddy tub' : pan.turbidity > 0.08 || pan.waterMurk > 0.2 ? 'cloudy' : 'clear';
      const loss = this.lossRate > 0.004 ? 'heavy' : this.lossRate > 0.0008 ? 'some' : 'low';
      rows = [
        ['Working', pan.phase === 'working' ? (events?.state ?? 'timid') : pan.phase],
        ['Settled', pan.stratification > 0.7 ? 'well' : pan.stratification > 0.4 ? 'partly' : 'mixed'],
        ['Water', water],
        ['Loss over lip', loss],
        ['Sand left', `${Math.round((pan.lightSand / pan.initialLightSand) * 100)}%`],
        ...(pan.kind === 'gravel' ? [['Sand', pan.grain < 0.35 ? 'fine silt' : pan.grain > 0.65 ? 'coarse grit' : 'medium'] as [string, string]] : []),
      ];
    } else if (mode === 'drywasher' && state.drywasher) {
      const dw = state.drywasher;
      const hopper = dw.hopperVolume / DRYWASHER_TUNING.hopperMax;
      const drawer = dw.drawerLoading;
      rows = [
        ['Bed', { still: 'still', underblown: 'underblown', balanced: 'balanced', overblown: 'overblown' }[state.drywasherEvents?.state ?? 'still']],
        ['Dust in the cloth', dw.dust > 0.6 ? 'choking' : dw.dust > 0.3 ? 'heavy' : dw.dust > 0.1 ? 'some' : 'clean'],
        ['Screen', dw.screenClog > 0.6 ? 'blinded' : dw.screenClog > 0.25 ? 'clogging' : 'clear'],
        ['On the screen', !dw.hasLoad ? 'empty' : dw.screened ? 'only rocks left' : hopper > 0.8 ? 'heaped' : 'gravel'],
        ['Drawer', drawer > 0.85 ? 'full' : drawer > 0.6 ? 'heavy' : drawer > 0.25 ? 'filling' : 'light'],
        ['Cloth', wearWord(dw.wear)],
      ];
    } else if (mode === 'highbanker' && state.highbanker) {
      const hb = state.highbanker;
      const heat = hb.heat;
      const fuel = hb.fuel / HIGHBANKER_TUNING.tank;
      const hopper = hb.hopperVolume / HIGHBANKER_TUNING.hopperMax;
      const moss = hb.sluice.mossLoading;
      rows = [
        ['Engine', hb.seized ? 'seized' : hb.running ? 'running' : hb.tooHot ? 'stalled, too hot' : hb.fuel <= 0 ? 'out of fuel' : 'stopped'],
        ['Engine hours', wearWord(hb.engineWear)],
        ['Pump', state.priming ? 'priming' : hb.primed ? 'primed' : hb.running ? 'sucking air' : 'not primed'],
        ['Water', hb.rinsing ? 'rinsing' : state.highbankerEvents?.spraying ? state.highbankerEvents.sluice.state : 'none'],
        ['Heat', heat > 0.85 ? 'overheating' : heat > 0.6 ? 'hot' : heat > 0.3 ? 'warm' : 'cool'],
        ['Fuel', `${fuel > 0.6 ? 'plenty' : fuel > 0.3 ? 'half' : fuel > 0.1 ? 'low' : fuel > 0 ? 'nearly out' : 'empty'} · ${state.session.fuelCans} can${state.session.fuelCans === 1 ? '' : 's'}`],
        ['Hopper', hb.jammed ? 'jammed' : hopper > 0.85 ? 'heaped' : hopper > 0.05 ? 'feeding' : 'empty'],
        ['Moss', moss > 0.85 ? 'full' : moss > 0.6 ? 'heavy' : moss > 0.25 ? 'loading' : 'fresh'],
        ['Riffles', wearWord(hb.sluice.wear)],
      ];
    } else if (mode === 'trommel' && state.trommel) {
      const t = state.trommel;
      const load = t.drumVolume / TROMMEL_TUNING.drumMax;
      const moss = t.deck.mossLoading;
      const fuel = t.fuel / TROMMEL_TUNING.tank;
      rows = [
        ['Engine', t.seized ? 'seized' : t.running ? 'running' : t.fuel <= 0 ? 'out of fuel' : 'stopped'],
        ['Drum', state.trommelEvents?.drum ?? (t.jammed ? 'jammed' : 'stopped')],
        ['In the drum', load > 0.8 ? 'nearly jammed' : load > 0.4 ? 'heavy' : load > 0.02 ? 'tumbling' : 'empty'],
        ['Clay', t.drumClay > 0.15 ? 'balling' : t.drumClay > 0.04 ? 'breaking up' : 'broken'],
        ['Deck water', t.rinsing ? 'rinsing' : (state.trommelEvents?.deck.state ?? 'none')],
        ['Moss', moss > 0.85 ? 'full' : moss > 0.6 ? 'heavy' : moss > 0.25 ? 'loading' : 'fresh'],
        ['Fuel', `${fuel > 0.6 ? 'plenty' : fuel > 0.3 ? 'half' : fuel > 0.1 ? 'low' : fuel > 0 ? 'nearly out' : 'empty'} · ${state.session.fuelCans} can${state.session.fuelCans === 1 ? '' : 's'}`],
        ['Wear', wearWord(t.wear)],
      ];
    } else if (mode === 'rocker' && state.rocker) {
      const r = state.rocker;
      const water = r.water;
      const apron = r.apronLoading;
      rows = [
        ['Rocking', state.fetchingWater ? 'fetching water' : { stalled: 'stalled', steady: 'steady', sloshing: 'sloshing' }[r.state]],
        ['Water in the box', water > ROCKER_TUNING.floodFrom ? 'flooding' : water > ROCKER_TUNING.goodWater ? 'plenty' : water > ROCKER_TUNING.lowWater ? 'low' : 'dry'],
        ['Bucket', `${r.bucket} of ${ROCKER_TUNING.bucketLadles} ladles`],
        ['Screen', !r.hasLoad ? 'empty' : r.screened ? 'only rocks left' : 'gravel'],
        ['Apron', apron > 0.85 ? 'full' : apron > 0.6 ? 'heavy' : apron > 0.25 ? 'loading' : 'fresh'],
        ['Canvas', wearWord(r.wear)],
      ];
    } else if (mode === 'magnet') {
      const fill = session.jar.blackSand / session.jarCapacity;
      const share = session.jarMagnetiteShare / MAGNET_TUNING.share;
      const clump = session.clump.sand / MAGNET_TUNING.clumpMax;
      rows = [
        ['Jar', fill > 0.9 ? 'full' : fill > 0.5 ? 'over half' : fill > 0.2 ? 'part full' : fill > 0.01 ? 'a little' : 'empty'],
        ['Magnetite left', share > 0.75 ? 'most' : share > 0.4 ? 'some' : share > 0.12 ? 'a little' : 'hardly any'],
        ['On the magnet', clump >= 0.99 ? 'full: strip it off' : clump > 0.5 ? 'a heavy clump' : clump > 0.02 ? 'a clump' : 'nothing'],
      ];
    } else if (mode === 'classifier' && state.classifier) {
      const c = state.classifier;
      const bucket = c.bucketVolume / 2.2;
      rows = [
        ['Screen', c.screen],
        ['On the screen', !c.hasLoad ? 'nothing' : c.screened ? 'only oversize left' : c.blinding > 0.4 ? 'sifting, mesh blinded' : 'sifting'],
        ['Rocks', String(c.rocks.length)],
        ['Bucket', bucket >= 0.99 ? 'full' : bucket > 0.66 ? 'nearly full' : bucket > 0.33 ? 'half full' : bucket > 0.005 ? 'some' : 'empty'],
      ];
    } else if (mode === 'sluice' && state.sluice) {
      // Words, not numbers: the moss and header are read by eye, and stay approximate.
      const sl = state.sluice;
      const moss = sl.mossLoading;
      const elapsed = sl.elapsed;
      const runLabel =
        moss >= 0.85 && elapsed > 120 ? 'overdue cleanout' :
        elapsed < 60 ? 'short run' :
        elapsed < 300 ? 'good run' :
        elapsed < 600 ? 'long run' :
        'overdue cleanout';
      const tailings = sl.tailingsLossRate;
      const tailingsLabel = tailings > 0.65 ? 'high' : tailings > 0.4 ? 'some' : 'low';
      rows = [
        ['Running', state.cleaningOut ? 'rinsing' : (state.sluiceEvents?.state ?? 'still')],
        ['Header', sl.jammed ? 'jammed' : sl.clog > 0.3 ? 'clogging' : sl.headerVolume > 1 ? 'backing up' : sl.headerVolume > 0.05 ? 'feeding' : 'empty'],
        ['Moss', moss > 0.85 ? 'full' : moss > 0.6 ? 'heavy' : moss > 0.25 ? 'loading' : 'fresh'],
        ['Slope', SLOPE_WORDS[sl.slopeState()]],
        ['Run duration', runLabel],
        ['Tailings loss', tailingsLabel],
        ['Riffles', wearWord(sl.wear)],
      ];
      const pump = sl.usesPump ? sl.kit.pump : null;
      if (pump) {
        const fuel = pump.fuel / SLUICE_TUNING.pumpTank;
        rows.push(['Pump', fuel <= 0 ? 'out of fuel' : fuel < 0.15 ? 'sputtering' : fuel < 0.5 ? 'running, tank half' : 'running'], ['Fuel cans', String(session.fuelCans)]);
      }
    } else if (mode === 'bank' && spot) {
      const layer = creek.currentLayer(spot);
      const dug = spot.layers.reduce((n, l) => n + l.initialLoads - l.loads, 0);
      rows = [
        ['Digging', spot.slumped > 0 ? 'slumped bank' : layer ? (layer.kind === 'overburden' && state.creek.profile.site === 'oldDiggings' ? 'old tailings' : LAYER_NAMES[layer.kind]) : 'worked out'],
        ['Shovelfuls dug', String(dug)],
        ['Water in hole', spot.water >= 1 ? 'flooded' : spot.water > 0.5 ? 'deep' : spot.water > 0.1 ? 'seeping' : 'dry'],
        ['Spoil pile', `${spot.spoil} shovelfuls`],
      ];
      if (state.tub) {
        const t = state.tub;
        rows.push(['Wash tub', state.tubFetching ? 'fetching water' : t.water < 0.1 ? 'empty' : `${t.water > 0.6 ? 'full' : t.water > 0.3 ? 'half' : 'low'}, ${t.turbidity > 0.6 ? 'muddy' : t.turbidity > 0.25 ? 'cloudy' : 'clear'}`]);
      }
    }
    this.inspect.innerHTML = [...rows, ...common].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }
}

function leadHeader(lead: Lead): string {
  const { low, high } = lead.richness;
  return `<b class="lead-name">${lead.name}</b> <span class="small">${SOURCE_NAMES[lead.source]}</span><p>${lead.note}</p>${describeGround(lead)}<p class="small">Suggests ${low.toFixed(1)}× to ${high.toFixed(1)}× the Home Creek.</p>`;
}

/**
 * How much of a stretch is left to dig, in round figures: the nearest ten percent, never exact.
 */
function groundWords(left: number): string {
  if (left <= 0) return 'Worked out.';
  if (left >= 1) return 'Untouched: all its ground left to dig.';
  const tens = Math.round(left * 10) * 10;
  if (tens <= 0) return 'Nearly worked out: under 10% of its ground left.';
  if (tens >= 100) return 'Barely touched: nearly all its ground left.';
  return `About ${tens}% of its ground left to dig.`;
}

/** How each source puts what it says about the ground, and how far to trust it. */
const GROUND_VOICE: Record<LeadSource, { says: string; trust: string }> = {
  colourTrail: { says: 'You followed the colour to', trust: '' },
  clue: { says: 'The clue points to', trust: 'sometimes wrong' },
  rumour: { says: 'Talk has it it’s', trust: 'often wrong' },
  claimRecord: { says: 'Recorded as', trust: 'usually right' },
  mapFragment: { says: 'Marked on the map as', trust: 'rarely wrong' },
};

const GROUND_NAMES: Record<SiteKind, string> = {
  homeCreek: 'the Home Creek',
  creekStretch: 'a plain creek stretch',
  creekBend: 'a creek bend',
  gravelBar: 'a gravel bar',
  ravine: 'a narrow ravine',
  dryWash: 'a dry wash',
  oldDiggings: 'abandoned diggings',
};

/**
 * What a lead says about the ground: the kind (or two it might be), what that means for the work,
 * any thin-water bench, and how far this kind of source can be trusted. Never presented as fact.
 */
function describeGround(lead: Lead): string {
  const ground = lead.ground;
  if (!ground) return '<p class="small">Says nothing about the ground.</p>';
  const voice = GROUND_VOICE[lead.source];
  const kinds = ground.kinds.map((k) => GROUND_NAMES[k]).join(' or ');
  const trust = voice.trust ? ` <span class="small">(${voice.trust})</span>` : '';
  const notes = ground.kinds
    .map((k) => (ground.kinds.length > 1 ? `${GROUND_NAMES[k].replace(/^an? /, '').replace(/^./, (c) => c.toUpperCase())}: ${traitsOf(k).groundNote}.` : `${traitsOf(k).groundNote.replace(/^./, (c) => c.toUpperCase())}.`))
    .join(' ');
  const bench = ground.bench ? ' Mentions a thin-water bench: a sluice could run there with a pump.' : '';
  return `<p>${voice.says} ${kinds}.${trust}</p><p class="small">${notes}${bench}</p>`;
}

function describeOffer(session: PanningSession): string {
  if (session.vial.length === 0) {
    return session.earned > 0
      ? `Nothing in the vial. You've sold ${session.soldMg.toFixed(1)} mg for $${session.earned.toFixed(2)} so far.`
      : 'Nothing in the vial yet. Pan some colour and bring it in.';
  }
  const q = quoteSale(session.vial);
  const lines = [[plural(q.counts.fine, 'speck'), plural(q.counts.flake, 'flake'), plural(q.counts.picker, 'picker')].join(', ')];
  if (q.weighedMg > 0) lines.push(`${q.weighedMg.toFixed(1)} mg by weight at ${Math.round(q.rate * 100)}% of spot: $${q.weighedValue.toFixed(2)}`);
  if (q.specimenMg > 0) lines.push(`Pickers as specimens: $${q.specimenValue.toFixed(2)}`);
  if (q.nextTier) lines.push(`Bring ${q.nextTier.fromMg} mg or more at once for ${Math.round(q.nextTier.rate * 100)}%.`);
  return lines.join('\n');
}

function describeFind(pieces: readonly GoldPiece[], sandLeft: number, cover: string): string {
  const count = (size: GoldPiece['size']): number => pieces.filter((p) => p.size === size).length;
  const pickers = count('picker');
  const flakes = count('flake');
  const specks = count('fine');
  // Sand left in the pan hides gold. Say so rather than implying the pan was empty.
  const covered = sandLeft > 0.25 ? ` Too much ${cover} left to see everything.` : '';
  if (pieces.length === 0) return `No colour showing.${covered}`;
  const parts: string[] = [];
  if (pickers) parts.push(plural(pickers, 'picker'));
  if (flakes) parts.push(plural(flakes, 'flake'));
  if (specks) parts.push(plural(specks, 'speck'));
  return `Colour! ${parts.join(', ')}.${covered}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/**
 * Set a button's label, with its keyboard shortcut ("Walk to town (T)") drawn as a keycap after the
 * words. On touch, forInput has already dropped the shortcut, so no keycap appears.
 */
export function setLabel(b: HTMLElement, label: string): void {
  if (b.dataset.label === label) return;
  b.dataset.label = label;
  const match = /\s\(([A-Z0+−]|Esc|Enter)\)/.exec(label);
  if (!match) {
    b.textContent = label;
    return;
  }
  const words = document.createElement('span');
  words.textContent = (label.slice(0, match.index) + label.slice(match.index + match[0].length)).trim();
  const cap = document.createElement('kbd');
  cap.textContent = match[1]!;
  b.replaceChildren(words, cap);
}

/** The action Esc performs on a screen: going back to the hole, the creek, the map or the counter. */
function isBack(label: string): boolean {
  return /\(Esc\)$/.test(label) || /^Back to the (hole|counter) \(N\)$/.test(label) || /^Done \(Esc\)$/.test(label);
}

function button(label: string, onClick: () => void): HTMLElement {
  const b = el('button', 'hud-action');
  (b as HTMLButtonElement).type = 'button';
  setLabel(b, label);
  b.addEventListener('click', () => {
    // Drop focus so Space (sift) cannot re-trigger the button.
    b.blur();
    onClick();
  });
  return b;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** A thing for sale in the outfitter: its name and words on the left, its tag or stamp on the right. */
function ware(name: string, body: string, side: string, owned = false): string {
  return `<div class="ware${owned ? ' owned' : ''}"><div><b>${name}</b>${body}</div>${side}</div>`;
}

/**
 * A price tag, which is also the buy button. When it can't be bought, the tag says why: what's
 * missing in cash, or the reason given.
 */
function priceTag(attrs: string, price: number, cash: number, blocked: string | null = null): string {
  const short = cash < price;
  const why = blocked ?? (short ? `$${(Math.ceil((price - cash) * 100) / 100).toFixed(2)} short` : 'Buy');
  return `<button type="button" class="tag" ${attrs} ${blocked || short ? 'disabled' : ''} aria-label="Buy for $${price}"><span class="tag-price">$${price}</span><span class="tag-why">${why}</span></button>`;
}
