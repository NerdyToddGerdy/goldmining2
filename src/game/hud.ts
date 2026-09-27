import {
  ECONOMY_TUNING,
  STAFF_TUNING,
  JOB_KINDS,
  crewGroundLeft,
  estimateHandTake,
  jobFits,
  traitsOf,
  type Crew,
  type CrewMachine,
  type JobIdle,
  type JobKind,
  type Role,
  type FinancialState,
  type SiteKind,
  OPERATOR_JOBS,
  type Economy,
  FUEL_CAN,
  MAGNET_TUNING,
  MIN_CONCENTRATE,
  OUTFITTER,
  ROCKER_TUNING,
  HIGHBANKER_TUNING,
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

export type Mode = 'creek' | 'bank' | 'pan' | 'town' | 'region' | 'sluice' | 'classifier' | 'magnet' | 'rocker' | 'highbanker' | 'drywasher';

export interface HudActions {
  // Pan
  reveal(): void;
  collect(saveBlackSand: boolean): void;
  backToHole(): void;
  panConcentrate(): void;
  setTilt(tilt: number): void;
  setShake(held: boolean): void;
  // Creek
  pickSpot(index: number): void;
  /** Dig at the spot selected by tapping (touch has no hover to preview spots). */
  digSelected(): void;
  // Bank
  shovel(into: 'pan' | 'spoil' | 'sluice' | 'classifier' | 'rocker' | 'highbanker' | 'drywasher'): void;
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
  hireHand(role: Role): void;
  dismissHand(workerId: number): void;
  sendHand(creekId: number, role: Role): void;
  recallHand(creekId: number): void;
  toggleJob(creekId: number, job: JobKind): void;
  buyCrewMachine(machine: CrewMachine): void;
  washReturned(): void;
  releaseClaim(creekId: number): void;
  restakeClaim(creekId: number): void;
  collectCrew(): void;
  // Highbanker
  openHighbanker(): void;
  setUpHighbanker(): void;
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
  rocker: 'Rocker',
  drywasher: 'Drywasher',
  pan: 'Pan',
  screen: 'Screen loads',
  haul: 'Haul',
  prospect: 'Prospect',
  finish: 'Finish concentrate',
};

const IDLE_WORDS: Record<JobIdle, string> = {
  noMachine: 'needs a crew unit (outfitter)',
  noSite: 'no free spot for it',
  noWater: 'no water here',
  workedOut: 'ground worked out',
  bucketFull: 'crew bucket full: collect it',
  noFuel: 'out of fuel cans',
  nothingToFinish: 'nothing to finish yet',
};

const CREW_GEAR: readonly [CrewMachine, string][] = [
  ['sluice', 'Crew sluice'],
  ['highbanker', 'Crew highbanker'],
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
 * Sift button (for touch) only show while panning. The inspection panel is off by default.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly panControls: HTMLElement;
  private readonly tilt: HTMLInputElement;
  private readonly sift: HTMLButtonElement;
  private readonly inspectToggle: HTMLElement;
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
  private readonly panel: HTMLElement;
  private panelKey = '';
  /** Small screens start with the notebook and claims board folded up. */
  private panelCollapsed = matchMedia('(max-width: 700px), (max-height: 500px)').matches;
  /** Which tab of the town's side menu is open; remembered between visits. */
  private townTab: 'outfitter' | 'claims' | 'office' = 'outfitter';
  private buttonsKey = '';
  private resultKey = '';
  private inspectOpen = true;
  private lossRate = 0;
  private toastTimer = 0;
  private state: HudState | null = null;

  constructor(private readonly on: HudActions) {
    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="hud-hint"></div>
      <div class="hud-cash"><span class="hud-cash-text"></span><div class="hud-day" title="How far through the working day"><div class="hud-day-fill"></div></div><div class="hud-money" hidden></div></div>
      <div class="hud-result" hidden></div>
      <div class="hud-inspect"></div>
      <div class="hud-toast" hidden></div>
      <div class="hud-panel" hidden></div>
      <div class="hud-bar">
        <span class="hud-pan-controls">
          <label class="hud-tilt">Tilt <input type="range" min="0" max="1" step="0.01" value="0" /></label>
          <button type="button" class="hud-shake">Sift</button>
        </span>
        <label class="hud-tilt hud-water" hidden>Water <input type="range" min="0" max="1" step="0.01" value="0.6" /></label>
        <label class="hud-tilt hud-slope" hidden>Slope <input type="range" min="0" max="1" step="0.01" value="0.5" /></label>
        <span class="hud-actions"></span>
        <button type="button" class="hud-inspect-toggle" title="Inspection panel (I)">Inspect (I)</button>
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
    this.cash = this.root.querySelector('.hud-cash-text') as HTMLElement;
    this.dayFill = this.root.querySelector('.hud-day-fill') as HTMLElement;
    this.moneyLine = this.root.querySelector('.hud-money') as HTMLElement;
    this.panel = this.root.querySelector('.hud-panel') as HTMLElement;
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
      if (target.dataset.action === 'hire') this.on.hireHand(target.dataset.role as Role);
      if (target.dataset.action === 'dismiss') this.on.dismissHand(Number(target.dataset.worker));
      if (target.dataset.action === 'send') this.on.sendHand(Number(target.dataset.creek), target.dataset.role as Role);
      if (target.dataset.action === 'recall') this.on.recallHand(Number(target.dataset.creek));
      if (target.dataset.action === 'job') this.on.toggleJob(Number(target.dataset.creek), target.dataset.job as JobKind);
      if (target.dataset.action === 'crewgear') this.on.buyCrewMachine(target.dataset.machine as CrewMachine);
      if (target.dataset.action === 'returned') this.on.washReturned();
      if (target.dataset.action === 'release') this.on.releaseClaim(Number(target.dataset.creek));
      if (target.dataset.action === 'restake') this.on.restakeClaim(Number(target.dataset.creek));
      if (target.dataset.action === 'buy') this.on.buyLead(id);
      if (target.dataset.action === 'follow') this.on.followLead(id);
    });

    this.tilt.addEventListener('input', () => on.setTilt(Number(this.tilt.value)));
    const shake = this.root.querySelector('.hud-shake') as HTMLButtonElement;
    this.sift = shake;
    shake.addEventListener('pointerdown', () => on.setShake(true));
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) shake.addEventListener(type, () => on.setShake(false));
    this.inspectToggle = this.root.querySelector('.hud-inspect-toggle') as HTMLElement;
    this.inspectToggle.addEventListener('click', () => this.toggleInspect());
    window.addEventListener('keydown', (e) => {
      // Space rocks the rocker one stroke per press; don't let it scroll or press a focused button.
      if (e.key === ' ' && this.state?.mode === 'rocker') e.preventDefault();
      this.handleKey(e.key.toLowerCase(), e.repeat);
    });
  }

  toast(message: string): void {
    this.toastEl.textContent = forInput(message);
    this.toastEl.hidden = false;
    // Longer messages stay up longer.
    this.toastTimer = Math.max(3, message.length / 18);
  }

  update(dt: number, state: HudState): void {
    this.state = state;
    const { mode, session, controls, events } = state;
    const pan = session.pan;

    const inspectLabel = forInput('Inspect (I)');
    if (this.inspectToggle.textContent !== inspectLabel) this.inspectToggle.textContent = inspectLabel;
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
    // The same slider is the sluice's Water, or the highbanker's Throttle.
    const onHighbanker = state.highbanker !== null && (mode === 'bank' || mode === 'highbanker');
    this.water.hidden = !(onHighbanker || (state.sluice && (mode === 'bank' || mode === 'sluice')));
    const waterText = onHighbanker ? 'Throttle ' : 'Water ';
    if (this.water.firstChild && this.water.firstChild.textContent !== waterText) this.water.firstChild.textContent = waterText;
    if (!this.water.hidden && document.activeElement !== this.waterInput) this.waterInput.value = String(onHighbanker ? state.throttle : state.sluiceFlow);
    // Adjustable legs: the slider covers only as far as the legs reach at this site.
    this.slope.hidden = this.water.hidden || !state.sluice?.kit.legs;
    if (!this.slope.hidden && state.sluice && document.activeElement !== this.slopeInput) {
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

    const buttons = this.buttonsFor(state).map(([label, action]): [string, () => void] => [forInput(label), action]);
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

    const spilled = events ? events.darkSpilled / Math.max(dt, 1e-6) : 0;
    this.lossRate += (spilled - this.lossRate) * Math.min(1, dt * 3);
    if (this.inspectOpen) this.renderInspect(state);
  }

  private buttonsFor(state: HudState): [string, () => void][] {
    const { mode, session, creek, spot } = state;
    if (mode === 'pan') {
      const phase = session.pan?.phase;
      if (phase === 'working') return [['Stop & reveal (R)', () => this.on.reveal()]];
      if (phase === 'revealed' && session.pan?.residueSpent) {
        return [['Collect (C)', () => this.on.collect(false)]];
      }
      if (phase === 'revealed') {
        const save = session.canSaveBlackSand ? 'Collect, save black sand (C)' : 'Collect, save black sand (jar full)';
        return [
          [save, () => this.on.collect(true)],
          ['Collect, dump black sand (D)', () => this.on.collect(false)],
        ];
      }
      // Keep panning from the classifier's bucket without walking back to it.
      const bucket: [string, () => void][] =
        state.classifier && state.classifier.bucketVolume > 0.005 ? [['Pan from the bucket (B)', () => this.on.panBucket()]] : [];
      return [...bucket, ['Back to the hole (N)', () => this.on.backToHole()], ...this.jarButton(session)];
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
      } else if (spot.sluiceSite && session.owns('sluice') && !state.highbanker) {
        list.push([session.sluicePlace ? 'Move the sluice here' : 'Set up the sluice here', () => this.on.setUpSluice()]);
      }
      if (state.drywasher) {
        if (blocked === null) list.push(['Shovel onto the drywasher (Y)', () => this.on.shovel('drywasher')]);
        list.push(['Drywasher (D)', () => this.on.openDrywasher()]);
      }
      if (state.tub && (state.tub.water < 1 || state.tub.turbidity > 0)) {
        list.push([state.tubFetching ? 'Hauling water…' : 'Change the tub water (U)', () => this.on.changeTubWater()]);
      }
      if (state.highbanker) {
        if (blocked === null && !state.highbanker.rinsing) list.push(['Shovel into the highbanker (F)', () => this.on.shovel('highbanker')]);
        list.push(['Watch the highbanker (V)', () => this.on.openHighbanker()], ...this.highbankerFuelButton(state));
      } else if (!state.sluice && !spot.gully && session.owns('highbanker') && siteAllows(state.creek.profile.site, 'highbanker')) {
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
      list.push(...this.jarButton(session), ['Back to the hole (Esc)', () => this.on.backToHole()]);
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
      list.push(...this.highbankerFuelButton(state), ['Clean out the moss (C)', () => this.on.highbankerCleanout()], ...this.jarButton(session));
      list.push(['Back to the hole (Esc)', () => this.on.backToHole()], ['Take down the highbanker', () => this.on.takeDownHighbanker()]);
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
      list.push(...this.jarButton(session), ['Back to the hole (Esc)', () => this.on.backToHole()]);
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
      list.push(...this.jarButton(session));
      list.push(['Back to the hole (Esc)', () => this.on.backToHole()], ['Take down the sluice', () => this.on.takeDownSluice()]);
      return list;
    }
    if (mode === 'town') {
      const offer = quoteSale(session.vial);
      const sell: [string, () => void][] = offer.total > 0 ? [[`Sell the vial for $${offer.total.toFixed(2)} (S)`, () => this.on.sell()]] : [];
      return [...sell, ...this.magnetButton(state), ['Back to the creek (Esc)', () => this.on.walkCreek()]];
    }
    if (mode === 'region') {
      return [[`Back to ${state.creek.profile.name} (Esc)`, () => this.on.walkCreek()], ['Start over', () => this.on.newCreek()]];
    }
    const selected = state.selectedSpot;
    const dig: [string, () => void][] = selected
      ? [[selected.gully ? 'Dig in the gully' : `Dig at spot ${state.creek.creekSpots.indexOf(selected) + 1}`, () => this.on.digSelected()]]
      : [];
    return [...dig, ['Region map (M)', () => this.on.openRegion()], ['Walk to town (T)', () => this.on.walkToTown()]];
  }

  /** The notebook of leads on the region map, and the claims board in town. */
  private renderPanel(state: HudState): void {
    const { mode, region, session } = state;
    const show = mode === 'region' || mode === 'town';
    const key = show
      ? `${mode}:${this.townTab}:${this.panelCollapsed}:${session.cash}:${OUTFITTER.map((g) => session.owns(g.id)).join()}:${session.fuelCans}:${JSON.stringify(session.sluicePlace)}:${state.money.state}:${state.money.daysToShutdown?.toFixed(1)}:${this.officeKey(state)}:${region.leads.map((l) => `${l.id}${l.status}`).join()}:${region.offers.map((o) => o.lead.id).join()}`
      : '';
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.panel.hidden = !show;
    this.panel.classList.toggle('collapsed', this.panelCollapsed);
    if (!show) return;
    if (mode === 'town') {
      const offers = region.offers.map(({ lead, price }) => {
        const afford = session.cash >= price;
        return `<div class="lead">${leadHeader(lead)}<button type="button" data-action="buy" data-lead="${lead.id}" ${afford ? '' : 'disabled'}>Buy for $${price}</button></div>`;
      });
      const gear = OUTFITTER.map((item) => {
        const place = session.sluicePlace;
        const base = item.requires ? OUTFITTER.find((g) => g.id === item.requires)! : null;
        const status = base && !session.owns(base.id)
          ? `<span class="small">Fits the ${base.name.toLowerCase()}: buy that first.</span>`
          : !session.owns(item.id)
          ? `<button type="button" data-action="gear" data-gear="${item.id}" ${session.cash >= item.price ? '' : 'disabled'}>Buy for $${item.price}</button>`
          : item.id !== 'sluice'
            ? '<span class="found">Yours.</span>'
            : place
              ? `<span class="found">Yours. Set up at ${region.creek(place.creekId).profile.name}.</span>`
              : '<span class="found">Yours. Packed and ready to set up.</span>';
        return `<div class="lead"><b>${item.name}</b><p class="small">${item.description}</p>${status}</div>`;
      });
      const crew = state.crew;
      gear.push(
        `<div class="lead"><b>Crew gear</b><p class="small">Extra machines for your crew, kept apart from your own. A crew job takes one when it needs it, and a sluice or highbanker job uses yours instead if it's set up at that stretch.</p>` +
          CREW_GEAR.map(
            ([machine, name]) =>
              `<p class="small">${name}${crew.spares[machine] ? ` · ${crew.spares[machine]} spare` : ''} <button type="button" data-action="crewgear" data-machine="${machine}" ${state.money.canCrewGear && session.cash >= STAFF_TUNING.machinePrice[machine] ? '' : 'disabled'}>Buy for $${STAFF_TUNING.machinePrice[machine]}</button></p>`,
          ).join('') +
          '</div>',
      );
      if (session.owns('pump') || session.owns('highbanker')) {
        const full = session.fuelCans >= FUEL_CAN.carryLimit;
        gear.push(
          `<div class="lead"><b>${FUEL_CAN.name}</b><p class="small">One can fills a tank, the pump's or the highbanker's. You're carrying ${session.fuelCans} of ${FUEL_CAN.carryLimit}.</p>` +
            `<button type="button" data-action="fuel" ${session.cash >= FUEL_CAN.price && !full ? '' : 'disabled'}>${full ? 'Can’t carry more' : `Buy for $${FUEL_CAN.price}`}</button></div>`,
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
          : `${offers.join('') || '<p>Nothing posted. Check back after more panning.</p>'}<p class="small">New leads go up every few pans. Rumours are cheap and often wrong; maps cost more and rarely lie.</p>`;
      this.panel.innerHTML = `${tabs}<div class="tab-body">${body}</div>`;
    } else {
      const leads = [...region.leads].reverse().map((lead) => {
        const action =
          lead.status === 'open' ? `<button type="button" data-action="follow" data-lead="${lead.id}">Follow it</button>`
          : lead.status === 'dud' ? '<span class="dud">Nothing there.</span>'
          : '<span class="found">Found. It is on the map.</span>';
        return `<div class="lead ${lead.status}">${leadHeader(lead)}${action}</div>`;
      });
      const open = region.leads.filter((l) => l.status === 'open').length;
      this.panel.innerHTML = `<h3>Notebook <span class="count">${open ? `${open} to follow` : region.leads.length}</span></h3>${leads.join('') || '<p>No leads yet. Pan along the creek and watch where the colour gets stronger, look for clues while digging, or buy a lead in town.</p>'}`;
    }
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
    const claims = economy.allClaims.map((c) => `${c.creekId}${c.status}${c.owed.toFixed(2)}`).join();
    const workers = crew.workers.map((w) => `${w.id}@${w.siteId}`).join();
    const sites = crew.sites.map((s) => `${s.creekId}:${s.jobs.join('+')}:${JOB_KINDS.map((j) => s.idle[j] ?? '').join('')}`).join();
    return `${claims}:${workers}:${sites}:${JSON.stringify(crew.spares)}:${crew.returned.blackSand.toFixed(3)}:${crew.wagesOwed.toFixed(2)}:${economy.day}`;
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
    parts.push(`<p class="small">Day ${economy.day}. Fees and wages come out of your cash whenever you're in town, as far as it goes. The Home Creek is free.</p>`);

    // The crew as a whole.
    const crewLines = [
      `<b>Your crew</b> <span class="small">${crew.workers.length ? `${crew.workers.length} on the payroll · ${money(crew.dailyWages)} a day` : 'nobody yet'}</span>`,
      '<p class="small">Your crew works your stretches while you are elsewhere: slower and less careful than you, so they buy you time, not gold. <b>Hands</b> pan, rock, haul, screen loads, prospect and finish concentrate. <b>Operators</b> also run the sluice, highbanker and drywasher. Send them to a stretch and switch on the jobs you want there; jobs are filled in the order you switched them on. What they make waits for you to collect at the stretch.</p>',
    ];
    if (crew.wagesOwed > 0) crewLines.push(`<p class="small">Wages owed: ${owing(crew.wagesOwed)}.</p>`);
    for (const role of ['hand', 'operator'] as const) {
      const ok = state.money.canHire && session.cash >= STAFF_TUNING.wage[role];
      crewLines.push(`<button type="button" data-action="hire" data-role="${role}" ${ok ? '' : 'disabled'}>Hire ${role === 'hand' ? 'a hand' : 'an operator'} for $${STAFF_TUNING.wage[role]} a day</button> `);
    }
    crewLines.push('<p class="small">The first day is paid up front.</p>');
    const idle = crew.idleWorkers;
    if (idle.length) {
      crewLines.push(
        `<p class="small">Waiting in town: ${idle.map((w) => `${w.name} (${w.role}) <button type="button" class="link" data-action="dismiss" data-worker="${w.id}">let go</button>`).join(' · ')}</p>`,
      );
    }
    const spares = CREW_GEAR.filter(([m]) => crew.spares[m] > 0).map(([m, name]) => `${crew.spares[m]} ${name.replace('Crew ', '')}`);
    if (spares.length) crewLines.push(`<p class="small">Spare crew gear: ${spares.join(', ')}.</p>`);
    if (crew.returned.blackSand > 0 || crew.returned.gold.length > 0) {
      crewLines.push('<p class="small">Your crew brought concentrate back to town.</p><button type="button" data-action="returned">Wash it into your jar</button>');
    }
    parts.push(`<div class="lead">${crewLines.join('')}</div>`);

    // Each claim: its hands and jobs, fees, release.
    const claims = economy.allClaims.map((claim) => {
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
      if (claim.status === 'released') {
        return `<div class="lead"><b>${name}</b> <span class="small">${kind} · $${claim.fee} a day</span><p>${status}</p><button type="button" data-action="restake" data-creek="${claim.creekId}" ${state.money.canRestake && session.cash >= ECONOMY_TUNING.restakeFee ? '' : 'disabled'}>Re-stake for $${ECONOMY_TUNING.restakeFee}</button></div>`;
      }
      const cap = traitsOf(creek.profile.site).crewMax;
      const here = crew.workersAt(claim.creekId);
      const site = crew.findSite(claim.creekId);
      const staffed = crew.staffedJobs(claim.creekId);
      const lines = [`<b>${name}</b> <span class="small">${kind} · $${claim.fee} a day</span><p>${status}</p>`];
      const room = here.length < cap && economy.canWork(claim.creekId);
      lines.push(
        `<p class="small">Crew here: ${here.length ? here.map((w) => `${w.name} (${w.role})`).join(', ') : 'none'} (room for ${cap}).</p>` +
          `<button type="button" data-action="send" data-role="hand" data-creek="${claim.creekId}" ${room && crew.idleOf('hand').length > 0 ? '' : 'disabled'}>Send a hand</button> ` +
          `<button type="button" data-action="send" data-role="operator" data-creek="${claim.creekId}" ${room && crew.idleOf('operator').length > 0 ? '' : 'disabled'}>Send an operator</button> ` +
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
                : ': working';
        return `<button type="button" class="job ${on ? 'on' : ''}" data-action="job" data-creek="${claim.creekId}" data-job="${job}" aria-pressed="${on}">${on ? '✓ ' : ''}${JOB_NAMES[job]}${detail}</button>`;
      });
      lines.push(`<div class="jobs">${jobs.join('')}</div>`);
      if (here.length > 0) {
        const days = crewGroundLeft(crew, creek);
        if (Number.isFinite(days)) {
          lines.push(`<p class="small">${days <= 0 ? 'The ground is worked out.' : days < 0.5 ? 'Less than half a day of ground left at their pace.' : `About ${Math.round(days * 2) / 2} days of ground left at their pace.`}</p>`);
        }
        const take = estimateHandTake(creek);
        lines.push(
          take
            ? `<p class="small">From your field notes, an operator on a machine here might bring in very roughly ${money(Math.max(0, take.low))} to ${money(take.high)} a day, against ${money(STAFF_TUNING.wage.operator)} in wages. Hand work brings in much less.</p>`
            : '<p class="small">Pan this stretch yourself to judge whether hands will pay here.</p>',
        );
      }
      lines.push(`<button type="button" data-action="release" data-creek="${claim.creekId}">Release</button>`);
      return `<div class="lead">${lines.join('')}</div>`;
    });
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
    if (key === 'i') return this.toggleInspect();
    const state = this.state;
    if (!state) return;
    const phase = state.session.pan?.phase;
    if (state.mode === 'creek') {
      const n = Number(key);
      if (Number.isInteger(n) && n >= 1) this.on.pickSpot(n - 1);
      else if (key === 't') this.on.walkToTown();
      else if (key === 'm' || key === 'escape') this.on.openRegion();
    } else if (state.mode === 'region') {
      if (key === 'escape') this.on.walkCreek();
    } else if (state.mode === 'rocker') {
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
      else if (key === 's') this.on.sell();
      else if (key === 'escape') this.on.walkCreek();
    } else if (state.mode === 'pan') {
      if (key === 'r' && phase === 'working') this.on.reveal();
      else if (key === 'c' && phase === 'revealed') this.on.collect(true);
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
      else if (key === 'j') this.on.panConcentrate();
      else if (key === 'escape') this.on.backToHole();
    } else if (state.mode === 'bank') {
      if (key === 'k' && state.classifier) this.on.shovel('classifier');
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

  private toggleInspect(): void {
    this.inspectOpen = !this.inspectOpen;
    this.inspect.hidden = !this.inspectOpen;
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
      ];
    } else if (mode === 'highbanker' && state.highbanker) {
      const hb = state.highbanker;
      const heat = hb.heat;
      const fuel = hb.fuel / HIGHBANKER_TUNING.tank;
      const hopper = hb.hopperVolume / HIGHBANKER_TUNING.hopperMax;
      const moss = hb.sluice.mossLoading;
      rows = [
        ['Engine', hb.running ? 'running' : hb.tooHot ? 'stalled, too hot' : hb.fuel <= 0 ? 'out of fuel' : 'stopped'],
        ['Pump', state.priming ? 'priming' : hb.primed ? 'primed' : hb.running ? 'sucking air' : 'not primed'],
        ['Water', hb.rinsing ? 'rinsing' : state.highbankerEvents?.spraying ? state.highbankerEvents.sluice.state : 'none'],
        ['Heat', heat > 0.85 ? 'overheating' : heat > 0.6 ? 'hot' : heat > 0.3 ? 'warm' : 'cool'],
        ['Fuel', `${fuel > 0.6 ? 'plenty' : fuel > 0.3 ? 'half' : fuel > 0.1 ? 'low' : fuel > 0 ? 'nearly out' : 'empty'} · ${state.session.fuelCans} can${state.session.fuelCans === 1 ? '' : 's'}`],
        ['Hopper', hb.jammed ? 'jammed' : hopper > 0.85 ? 'heaped' : hopper > 0.05 ? 'feeding' : 'empty'],
        ['Moss', moss > 0.85 ? 'full' : moss > 0.6 ? 'heavy' : moss > 0.25 ? 'loading' : 'fresh'],
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
        ['Digging', spot.slumped > 0 ? 'slumped bank' : layer ? LAYER_NAMES[layer.kind] : 'worked out'],
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
  return `<b>${lead.name}</b> <span class="small">${SOURCE_NAMES[lead.source]}</span><p>${lead.note}</p>${describeGround(lead)}<p class="small">Suggests ${low.toFixed(1)}× to ${high.toFixed(1)}× the Home Creek.</p>`;
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

function button(label: string, onClick: () => void): HTMLElement {
  const b = el('button', 'hud-action');
  (b as HTMLButtonElement).type = 'button';
  b.textContent = label;
  b.addEventListener('click', () => {
    // Drop focus so Space (sift) cannot re-trigger the button.
    b.blur();
    onClick();
  });
  return b;
}
