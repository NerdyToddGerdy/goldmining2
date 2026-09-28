import { Application } from 'pixi.js';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/kalam/latin-700.css';
import {
  PanningSession,
  Region,
  createRng,
  createSave,
  loadSave,
  buyGear,
  buyFuel,
  buyRepairKit,
  REPAIR_KIT,
  WEAR_TUNING,
  CLASSIFIER_TUNING,
  Crew,
  ECONOMY_TUNING,
  Finance,
  FINANCE_TUNING,
  OUTFITTER,
  type FinanceEvent,
  type FinancialState,
  type Purchase,
  Economy,
  type CrewMachine,
  rollShovelful,
  totalMg,
  type Classifier,
  type Creek,
  type DigSpot,
  type FollowResult,
  type GearId,
  type LayerKind,
  type MagnetStepEvents,
  type Rocker,
  type Highbanker,
  type HighbankerStepEvents,
  type Drywasher,
  type DrywasherStepEvents,
  type WashTub,
  dipPan,
  refillTub,
  tubHasWater,
  HIGHBANKER_TUNING,
  ROCKER_TUNING,
  needsPump,
  traitsOf,
  MIN_CONCENTRATE,
  type PanStepEvents,
  type ShovelResult,
  type Sluice,
  type SluiceStepEvents,
} from './sim';
import { BankView, type ShovelTarget } from './game/bankView';
import { CreekMapView } from './game/creekMapView';
import { CreekScene } from './game/creekScene';
import { DrywasherCoach, HighbankerCoach, PanCoach, RockerCoach, SluiceCoach } from './game/coach';
import { Hud, type Mode } from './game/hud';
import { PanInput } from './game/panInput';
import { PanView } from './game/panView';
import { RegionMapView } from './game/regionMapView';
import { ClassifierView } from './game/classifierView';
import { SluiceView } from './game/sluiceView';
import { MagnetView } from './game/magnetView';
import { RockerView } from './game/rockerView';
import { HighbankerView } from './game/highbankerView';
import { DrywasherView } from './game/drywasherView';
import { TownView } from './game/townView';
import { clearSave, readSave, writeSave } from './game/storage';
import { usingTouch } from './game/inputMode';

/** Simulation runs on a fixed step so outcomes do not depend on frame rate. */
const SIM_DT = 1 / 60;
const AUTOSAVE_SECONDS = 3;

const BLOCKED_MESSAGES = {
  boulder: 'A boulder is in the way. Pry it loose first.',
  flooded: 'The hole has flooded. Bail it out with your pan.',
  workedOut: 'This spot is worked out. Walk the creek and find another.',
} as const;

const EVENT_MESSAGES = {
  boulder: 'Your shovel rings off a boulder.',
  slump: 'The wall slumps into the hole.',
  reachedBedrock: 'Bedrock! Scrape the cracks: the richest material in the creek.',
  workedOut: 'That was the last of this spot.',
} as const;

const CREW_MACHINE_NAMES: Record<CrewMachine, string> = {
  sluice: 'sluice',
  highbanker: 'highbanker',
  rocker: 'rocker box',
  drywasher: 'drywasher',
  classifier: 'classifier',
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const BOUGHT_MESSAGES: Record<GearId, string> = {
  sluice: 'A hand sluice, riffles and moss and all. It only sets up where a creek has steady water and a drop: look for a creek bend.',
  bigJar: 'A big concentrate jar: three times the room for black sand.',
  classifier: 'A hand classifier. Use it on the stretches you find; the Home Creek is too narrow for it.',
  riffleMat: 'A riffle insert and ribbed mat, fitted to your sluice. It holds fine gold better: you will see it at cleanout.',
  legs: 'Adjustable legs, fitted to your sluice. Set its slope with the Slope slider while it runs.',
  rocker: 'A rocker box. Set it up on any stretch you find: shovel gravel onto its screen, ladle water over it, and rock it on a steady beat.',
  highbanker: 'A highbanker. Set it up on the bank at a creek bend, gravel bar or ravine: prime the pump, start the engine, and shovel into the hopper. Buy fuel here by the can.',
  finishingPan: 'A finishing pan. When you pan your jar in town or on a found stretch, it’s the one you reach for: tip it a little less, and it keeps the fines.',
  snuffer: 'A snuffer bottle. At the reveal, tap along the black-sand tail (F) to draw up fine gold. Work the tail thin first, and don’t get greedy.',
  washTub: 'A wash tub. On a dry wash, fill it and you can pan there. Change the water when it gets muddy: muddy water hides colour.',
  drywasher: 'A drywasher. On a dry wash, shovel onto its screen and hold Pump to work the bellows. Set the Air so the light sand drifts off and the heavies stay.',
  magnet: 'A magnet in a plastic sleeve. Clean your jar with it here in town or out on a stretch: close is quick, but drags fine gold up with the sand.',
  pump: 'A recirculating pump. It lets the sluice run where the creek is too thin, if you keep it fuelled: buy fuel here by the can.',
};

/** Several fixed steps in one frame, summed so nothing that happened is dropped. */
function mergeHighbankerEvents(prev: HighbankerStepEvents | null, e: HighbankerStepEvents): HighbankerStepEvents {
  if (!prev) return e;
  const p = prev.sluice;
  return {
    ...e,
    event: e.event ?? prev.event,
    passed: e.passed + prev.passed,
    rocksOff: e.rocksOff + prev.rocksOff,
    sluice: { ...e.sluice, released: e.sluice.released + p.released, goldLost: e.sluice.goldLost + p.goldLost, blackLost: e.sluice.blackLost + p.blackLost, glints: e.sluice.glints + p.glints },
  };
}

/** Shown once per message, so a broken frame doesn't flood the screen. */
const reportedErrors = new Set<string>();
let showError: (message: string) => void = () => {};

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  if (reportedErrors.has(message)) return;
  reportedErrors.add(message);
  showError(message);
}

async function start(): Promise<void> {
  const host = document.getElementById('game');
  if (!host) throw new Error('Missing #game element');

  // The first click is also the user gesture browsers require before audio can play. Listen right
  // away, before the renderer loads, so a quick click on a slow connection isn't lost.
  const overlay = document.getElementById('start');
  const prompt = overlay?.querySelector('.start-prompt');
  if (prompt) {
    // A saved game carries on; a new one starts at the Home Creek.
    const verb = matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    prompt.textContent = readSave() ? `${verb} to carry on` : `${verb} to start at the creek`;
  }
  overlay?.addEventListener('click', () => overlay.remove(), { once: true });
  overlay?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') overlay.remove();
  });

  const app = new Application();
  // Render at the screen's real pixel density so phones and tablets are sharp; cap at 2x for speed.
  await app.init({
    resizeTo: host,
    background: 0x1d2419,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  // No long-press menus over the game: a held finger is shaking the pan or carrying a shovelful.
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  host.appendChild(app.canvas);

  const rng = createRng(Date.now());
  const loaded = loadSave(readSave(), rng);
  const region = loaded?.region ?? new Region(rng);
  const session = loaded?.session ?? new PanningSession(rng);
  const economy = loaded?.economy ?? new Economy();
  const crew = loaded?.crew ?? new Crew(rng);
  /** Behind on fees or wages: no new gear, leads, or hires until paid. Never takes anything away. */
  const finance = loaded?.finance ?? new Finance();
  const books = () => ({ session, economy, crew, region });
  /** Why a purchase isn't allowed in the current financial state, or null if it is. */
  const refused = (purchase: Purchase, price = 0): string | null => (finance.allows(purchase, books(), price) ? null : MONEY_MESSAGES[finance.state(books())]);
  const MONEY_MESSAGES: Record<FinancialState, string> = {
    healthy: '',
    strained: "Money's tight: you owe more than you have on hand. No hiring or big purchases until you can cover it. Sell some gold.",
    insolvent: "You're insolvent: nothing can be bought but fuel until what you owe is paid. Sell some gold here.",
    recovering: "You're still paying off what you owed before the shutdown. Pan and sell to clear it; buying opens up again once it's paid.",
  };
  let creek: Creek = loaded ? region.creek(loaded.place.creekId) : region.home;
  let mode: Mode = 'creek';
  let spot: DigSpot | null = loaded?.place.spotId != null ? creek.spot(loaded.place.spotId) : null;
  /** Topsoil pans in a row; after a few, a one-time tip to dig past it. */
  let topsoilPans = 0;
  let toldAboutTopsoil = false;
  let panLayer: LayerKind | 'slump' | null = null;
  /** The sluice: its intake setting, whether a cleanout is under way, and its last step. */
  let sluiceFlow = 0.75;
  let cleaningOut = false;
  let sluiceEvents: SluiceStepEvents | null = null;
  const sluiceHere = (): Sluice | null => (spot ? session.sluiceAt(creek.id, spot.id) : null);
  /** The highbanker: set up on the bank beside a spot, its throttle, and a prime under way. */
  const highbankerHere = (): Highbanker | null => (spot ? session.highbankerAt(creek.id, spot.id) : null);
  let throttle = 0.6;
  let highbankerEvents: HighbankerStepEvents | null = null;
  let primingLeft: number | null = null;
  let toldAboutHighbanker = false;
  /** The classifier travels with the player, but the Home Creek has no room for it. */
  const classifierHere = (): Classifier | null => (session.classifier && region.allows(creek, 'classifier') ? session.classifier : null);
  /** The rocker travels with the player too, and likewise has no room at the Home Creek. */
  const rockerHere = (): Rocker | null => (session.rocker && region.allows(creek, 'rocker') ? session.rocker : null);
  /** A dry wash has no water to pan in. */
  /** Dry gear travels with the player, but is only for ground with no water. */
  const drywasherHere = (): Drywasher | null => (session.drywasher && region.allows(creek, 'drywasher') ? session.drywasher : null);
  const tubHere = (): WashTub | null => (session.tub && region.allows(creek, 'washTub') ? session.tub : null);
  /** Hauling water for the tub: seconds left, and how long the trip takes here. */
  let tubFetching: number | null = null;
  let tubFetchTotal = 1;
  let drywasherEvents: DrywasherStepEvents | null = null;
  let toldAboutDrywasher = false;
  let toldMuddyTub = false;
  /** A creek to pan in, or on dry ground a wash tub with water in it. */
  const canPanHere = (): boolean => {
    if (inTown() || region.allows(creek, 'pan')) return true;
    const tub = tubHere();
    return tub !== null && tubHasWater(tub) && tubFetching === null;
  };
  const noPanWater = (): string => {
    const tub = tubHere();
    if (tubFetching !== null) return "You're still hauling water for the tub.";
    if (tub) return usingTouch() ? 'The wash tub is empty. Fetch water for it.' : 'The wash tub is empty. Fetch water for it (U).';
    return 'There is no water here to pan in. Bring a wash tub from the outfitter, haul water to a rocker box, or carry what you dig somewhere wetter.';
  };
  /**
   * Dip a pan in the wash tub on dry ground: returns how muddy the water is for this pan, or 0 at
   * a creek. Warns once when the water has got thick.
   */
  const panWater = (clayiness: number): number => {
    if (region.allows(creek, 'pan') || inTown()) return 0;
    const tub = tubHere();
    const murk = tub ? (dipPan(tub, clayiness) ?? 0) : 0;
    if (murk > 0.6 && !toldMuddyTub) {
      toldMuddyTub = true;
      hud.toast(`The tub water is thick with mud: it's slow to settle and hides colour. ${usingTouch() ? 'Change it' : 'Change it (U)'} when you can.`);
    }
    if (murk < 0.3) toldMuddyTub = false;
    return murk;
  };
  /** Floods that happened while the player was elsewhere, to hear about on arrival. */
  const floodNews = new Set<number>();
  /** Fetching a bucket for the rocker: seconds left, and how long the trip takes here. */
  let fetchingWater: number | null = null;
  let fetchTotal = 1;
  let toldAboutRocker = false;
  /** Where the magnet was picked up from, to go back to when done. */
  let magnetReturn: 'town' | 'bank' = 'town';
  /** Finishing gear (the finishing pan, the snuffer) is for town and found stretches, never the Home Creek. */
  const finishingHere = (): boolean => inTown() || region.allows(creek, 'magnet');
  /** Where along the tail F snuffs next: it works down the tail and starts over. */
  let snuffNext = 0.05;
  const snuffAt = (at: number): void => {
    const pan = session.pan;
    if (!pan || pan.phase !== 'revealed' || !session.owns('snuffer')) return;
    if (!finishingHere()) return hud.toast('The Home Creek is shovel and pan only: the snuffer bottle is for town and the stretches you find.');
    const wasCloudy = pan.bottleCloudy;
    session.snuff(at);
    panView.snuffed(at);
    if (pan.bottleCloudy && !wasCloudy) hud.toast('The bottle has gone cloudy with sand: its specks will go back in the jar to pan again. Work the tail thinner before you snuff.');
  };
  /** Where the pan came out: the jar can be panned at the assay office's wash trough in town. */
  let panReturn: 'town' | 'bank' = 'bank';
  let toldAboutMagnet = false;
  /** In town, or at the magnet table there: time is covered by the trip, and the player isn't at any stretch. */
  const inTown = (): boolean => mode === 'town' || (mode === 'magnet' && magnetReturn === 'town') || (mode === 'pan' && panReturn === 'town');
  /** Where the pan's current shovelful came from, for field notes and gully colour. */
  let panSpot: DigSpot | null = session.pan?.kind === 'gravel' && session.pan.phase !== 'emptied' ? spot : null;

  const setMode = (next: Mode): void => {
    // Taking up the pan: from the town counter it's the wash trough out back, anywhere else the creek.
    if (next === 'pan' && mode !== 'pan') {
      panReturn = mode === 'town' ? 'town' : 'bank';
      scene.setSetting(panReturn === 'town' ? 'town' : 'creek');
    }
    mode = next;
    if (mode !== 'creek') creekMap.selected = null;
    regionMap.visible = mode === 'region';
    creekMap.visible = mode === 'creek';
    bankView.visible = mode === 'bank';
    sluiceView.visible = mode === 'sluice';
    highbankerView.visible = mode === 'highbanker';
    drywasherView.visible = mode === 'drywasher';
    classifierView.visible = mode === 'classifier';
    townView.visible = mode === 'town';
    magnetView.visible = mode === 'magnet';
    scene.visible = panView.visible = mode === 'pan';
    rockerView.visible = mode === 'rocker';
    if (mode !== 'rocker') fetchingWater = null; // Walking off abandons the trip for water.
    input.enabled = mode === 'pan' || mode === 'classifier' || mode === 'magnet' || mode === 'drywasher';
  };

  /** Every new pan starts level, ready to settle, whatever the last pan was left at. */
  const startPanning = (): void => {
    input.tilt = 0;
    input.shakeHeld = false;
    setMode('pan');
  };

  /** Why this creek can't be worked right now, if it can't: a lapsed or released claim. */
  const claimBlock = (): string | null => {
    if (economy.canWork(creek.id)) return null;
    return economy.claim(creek.id)?.status === 'released'
      ? `You released your claim on ${creek.profile.name}. Re-stake it in town to work it again.`
      : `Your claim on ${creek.profile.name} has lapsed for unpaid fees. Pay them in town to work it again.`;
  };

  const shovel = (into: ShovelTarget): void => {
    // Dig from the bank, or straight from the close-up of the machine being fed, so feeding a run
    // doesn't mean walking back and forth.
    const fromCloseUp =
      (into === 'classifier' && mode === 'classifier') ||
      (into === 'sluice' && mode === 'sluice') ||
      (into === 'rocker' && mode === 'rocker') ||
      (into === 'highbanker' && mode === 'highbanker') ||
      (into === 'drywasher' && mode === 'drywasher');
    if (!spot || (mode !== 'bank' && !fromCloseUp)) return;
    const blockedClaim = claimBlock();
    if (blockedClaim) return hud.toast(blockedClaim);
    if (into === 'pan' && !canPanHere()) return hud.toast(noPanWater());
    // A pan left half-washed (Esc back to the hole) has to be finished before another goes in.
    if (into === 'pan' && !session.panIsFree) {
      setMode('pan');
      return hud.toast('You still have a pan on the go. Finish it first.');
    }
    const sluice = into === 'sluice' ? sluiceHere() : null;
    const highbanker = into === 'highbanker' ? highbankerHere() : null;
    const drywasher = into === 'drywasher' ? drywasherHere() : null;
    if (into === 'drywasher') {
      if (!drywasher) return;
      if (drywasher.hopperFull) {
        openDrywasher();
        return hud.toast('The screen is heaped full. Work the bellows to get it through first.');
      }
    }
    if (into === 'highbanker') {
      if (!highbanker) return;
      if (highbanker.rinsing) return hud.toast('Finish the cleanout before feeding the hopper again.');
      if (highbanker.hopperFull) return hud.toast("The hopper is heaped full. Let the spray work it down.");
    }
    const classifier = into === 'classifier' ? classifierHere() : null;
    const rocker = into === 'rocker' ? rockerHere() : null;
    if (into === 'rocker') {
      if (!rocker) return;
      if (rocker.hopperFull) {
        openRocker();
        return hud.toast('The screen is heaped full. Rock it through first.');
      }
    }
    if (into === 'classifier') {
      if (!classifier) return;
      if (classifier.hasLoad) {
        openClassifier();
        return hud.toast("There's still a load on the screen. Sift it through and tip off the oversize first.");
      }
      if (classifier.bucketFull) {
        openClassifier();
        return hud.toast('The bucket is full. Pan from the bucket, or pour it into the sluice.');
      }
    }
    if (into === 'sluice') {
      if (!sluice) return;
      if (cleaningOut) return hud.toast('Finish the cleanout before feeding the sluice again.');
      if (sluice.feedBlocked === 'jammed') return hud.toast('The intake is jammed. Rake it clear first: tap the sluice for a close look.');
      if (sluice.feedBlocked === 'full') return hud.toast('The header is brim full. Give the water a moment to carry it down.');
    }
    const highWaterBefore = creek.highWaterEvents;
    // A shovelful for the sluice is dug just like one for the pan; it just lands in the header.
    const result: ShovelResult = creek.shovel(spot.id, into === 'spoil' ? 'spoil' : 'pan');
    if (!result.ok) {
      hud.toast(BLOCKED_MESSAGES[result.blocked]);
      return;
    }
    bankView.landed(into, result.from);
    if (result.event) hud.toast(EVENT_MESSAGES[result.event]);
    if (creek.highWaterEvents > highWaterBefore) hud.toast('High water has come through and left fresh gravel along the creek.');
    if (result.clue) {
      const lead = region.clueFound();
      hud.toast(`Your shovel turns something up. ${lead.note} It points to ${lead.name}. Noted in your notebook (M).`);
    }
    if (result.load && classifier) {
      classifier.load(rollShovelful(rng, result.load));
      openClassifier();
    } else if (result.load && rocker) {
      rocker.feed(result.load);
      if (mode !== 'rocker') openRocker();
    } else if (result.load && sluice) {
      sluice.feed(result.load);
    } else if (result.load && drywasher) {
      drywasher.feed(result.load);
      if (mode !== 'drywasher') openDrywasher();
    } else if (result.load && highbanker) {
      highbanker.feed(result.load);
    } else if (result.load) {
      session.startPan(result.load, panWater(result.load.clayiness));
      panSpot = spot;
      panLayer = result.from;
      startPanning();
    }
  };

  const collect = (saveBlackSand: boolean): void => {
    const pan = session.pan;
    if (!pan || pan.phase !== 'revealed') return;
    const collected = session.collect(saveBlackSand);
    if (collected === null) {
      hud.toast("Your jar is full. Dump this pan's black sand, then pan the jar down before saving more (a bigger jar is sold in town).");
      return;
    }
    const from = panSpot;
    panSpot = null;
    if (pan.kind !== 'gravel' || !from) return;
    // A slumped bank is mostly topsoil; a bucket pan has no single layer.
    creek.recordPan(from.id, totalMg(collected), panLayer === 'slump' ? 'overburden' : panLayer);
    // Topsoil barely pays: after a few pans of it, say once where the gold actually is.
    // (At old diggings the top layer is their tailings, which does pay.)
    topsoilPans = panLayer === 'overburden' && creek.profile.site !== 'oldDiggings' ? topsoilPans + 1 : 0;
    if (topsoilPans >= 3 && !toldAboutTopsoil) {
      toldAboutTopsoil = true;
      hud.toast('Topsoil rarely pays. Toss it onto the spoil pile to dig down to the gravel: gold settles low, near bedrock.');
    }
    // Colour up a source gully: follow it to where it comes from.
    if (from.gully && collected.length > 0) {
      const traced = region.traceGully(from);
      if (traced?.found) {
        passTime(ECONOMY_TUNING.travel.lead);
        economy.stakeFound(region);
        hud.toast(`Colour in the gully! You follow it upstream to ${traced.creek.profile.name} and stake a claim. It is on your region map (M).${salvageNote(traced.salvage)}`);
      }
    }
  };

  const describeFollow = (result: FollowResult): string =>
    result.found
      ? `You find ${result.creek.profile.name} and stake a claim ($${economy.claim(result.creek.id)?.fee ?? 1} a day, paid in town). It is on your region map now.${salvageNote(result.salvage)}`
      : `You walk out to ${result.lead.name}, but there's nothing there. The ${result.lead.source === 'rumour' ? 'rumour' : 'lead'} was wrong.`;
  /** Old workings leave things lying about: gathered up and sold on as scrap, for a few dollars. */
  const salvageNote = (salvage: number): string => {
    if (salvage <= 0) return '';
    session.cash = Math.round((session.cash + salvage) * 100) / 100;
    checkBooks();
    return ` Old workings: you gather up rusted riffle bars, a pick head and some good timber, $${salvage.toFixed(2)} in scrap.`;
  };

  /**
   * Game time passes: claim fees and wages run up, and a hand works the sluice if the player is
   * elsewhere. Driven by active play and travel, never the wall clock.
   */
  const passTime = (seconds: number): void => {
    try {
      passTimeUnguarded(seconds);
    } catch (error) {
      // Never strand the player: whatever broke, travel and play carry on, and the error is shown.
      reportError(error);
    }
  };
  const passTimeUnguarded = (seconds: number): void => {
    // Long stretches (travel) go in short steps, so a claim lapsing or a hand quitting partway
    // through takes effect from that moment on.
    for (let left = seconds; left > 1e-9; left -= 30) {
      const chunk = Math.min(30, left);
      economy.advance(chunk);
      const quit = crew.accrue(chunk, region);
      if (quit) hud.toast(`${quit.name} has walked off the job over unpaid wages. You still owe the crew; pay it in town.`);
      const leadsBefore = region.leads.length;
      crew.work(chunk, { session, region, economy, playerAt: !inTown() && mode !== 'region' ? creek.id : null });
      for (const lead of region.leads.slice(leadsBefore)) {
        hud.toast(
          lead.status === 'followed'
            ? `Word from your crew: they followed colour up a gully to ${lead.name} and staked it. It's on your region map.`
            : `Word from your crew: they turned up a lead to ${lead.name}. It's in your notebook.`,
        );
      }
      for (const flooded of region.weather(chunk, session)) {
        if (flooded === creek && !inTown() && mode !== 'region') hud.toast(floodMessage(flooded, true));
        else floodNews.add(flooded.id);
      }
      // The Home Creek renews a spot at a time.
      const renewed = region.home.trickle(chunk / ECONOMY_TUNING.daySeconds);
      if (renewed.length > 0 && creek === region.home && !inTown() && mode !== 'region') {
        const where = renewed.map((spot) => (spot.gully ? 'a gully' : `spot ${region.home.creekSpots.indexOf(spot) + 1}`));
        hud.toast(`The creek rises a little and leaves fresh gravel at ${where.join(' and ')}.`);
      }
      checkBooks();
    }
  };

  const floodMessage = (flooded: Creek, here: boolean): string => {
    const sluice = session.sluicePlace?.creekId === flooded.id;
    return (
      (here ? `High water sweeps down ${flooded.profile.name}! ` : `High water came through ${flooded.profile.name} while you were away. `) +
      'Open holes are half buried in fresh gravel, and worked-out ground has a new layer to dig.' +
      (sluice ? ' Your sluice took a beating: its header was swept clean, its moss stripped, and its intake choked with debris.' : '')
    );
  };

  /** Pay what's owed from cash on hand, fees first, and say what was paid. */
  const settleUp = (): void => {
    const fees = economy.payFees(session);
    const wages = crew.payWages(session);
    const parts = [fees > 0 ? `$${fees.toFixed(2)} in claim fees` : '', wages > 0 ? `$${wages.toFixed(2)} in wages` : ''].filter(Boolean);
    if (parts.length) hud.toast(`Paid ${parts.join(' and ')}.${finance.state(books()) !== 'healthy' ? " You're still behind." : ''}`);
    checkBooks();
  };

  /** Look at the books after money moves or time passes, and tell the player what changed. */
  const checkBooks = (): void => {
    for (const event of finance.update(books())) tellFinance(event);
  };
  const tellFinance = (event: FinanceEvent): void => {
    switch (event.kind) {
      case 'strained':
        return hud.toast("Money's tight: you owe more than you have on hand. No hiring or big purchases until you can cover it.");
      case 'healthy':
        return hud.toast('Your books are square again.');
      case 'insolvent': {
        const names = event.walkedOff.map((w) => w.name);
        const who = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        return hud.toast(
          `You can't pay what you owe.${names.length ? ` With no money for wages, ${who} down${names.length === 1 ? 's' : ''} tools and leave${names.length === 1 ? 's' : ''}: what they're owed stays owed.` : ''} ` +
            `Pay up in town within ${FINANCE_TUNING.shutdownAfterDays} days, or your claims will be shut down.`,
        );
      }
      case 'recovered':
        return hud.toast("You've paid off the last of it. You're back on your feet: the outfitter, the claims board and hiring are open to you again.");
      case 'shutdown': {
        const lost = event.claimsLost;
        hud.toast(
          `You couldn't pay. ${lost.length ? `The claims go back: ${lost.join(', ')}. ` : ''}` +
            `Your machines are packed and kept${event.scrap > 0 ? `, the crew's gear sold for scrap ($${event.scrap.toFixed(2)})` : ''}` +
            `${event.salvage > 0 ? `, and a little salvage from the camps ($${event.salvage.toFixed(2)})` : ''} went to what you owed. ` +
            `${event.lead ? `Someone you worked alongside tells you about ${event.lead}: it's in your notebook. ` : ''}` +
            `${event.carried ? "What wouldn't fit in your jar is waiting for you in town. " : ''}` +
            "You're back at the Home Creek with your shovel, your pan and everything you carry. It's still yours, and it still pays.",
        );
        // Back to where it started: the Home Creek is always there, free.
        spot = null;
        creek = region.home;
        creekMap.setCreek(region.home);
        setMode('creek');
        return;
      }
    }
  };

  const goToCreek = (next: Creek): void => {
    tubFetching = null;
    if (next !== creek) {
      spot = null;
      passTime(ECONOMY_TUNING.travel.creek + traitsOf(next.profile.site).access);
    }
    creek = next;
    creekMap.setCreek(next);
    setMode('creek');
    if (floodNews.delete(next.id)) hud.toast(floodMessage(next, false));
    // Back at a stretch the crew is working: hear what they did.
    const report = crew.takeReport(next.id);
    if (report.seconds > 30) {
      const names = crew.workersAt(next.id).map((w) => w.name);
      const who = names.length === 0 ? 'Your crew' : names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      const hours = Math.max(1, Math.round(report.seconds / (ECONOMY_TUNING.daySeconds / 10)));
      const did = [
        report.shovelfuls ? plural(report.shovelfuls, 'shovelful') + ' dug' : '',
        report.pans ? plural(report.pans, 'pan') + ' worked' : '',
        report.cleanouts ? plural(report.cleanouts, 'cleanout') : '',
        report.leads.length ? `${plural(report.leads.length, 'lead')} turned up` : '',
      ].filter(Boolean);
      hud.toast(`${who} worked about ${hours} hour${hours === 1 ? '' : 's'} while you were gone: ${did.join(', ') || 'little to show for it'}. Collect what they have from the bank (W).`);
    }
  };

  const walkToTown = (): void => {
    if (mode !== 'town') passTime(ECONOMY_TUNING.travel.town);
    region.restockOffers(session.pansWorked);
    crew.refreshApplicants(economy.day);
    setMode('town');
    settleUp();
  };

  const pry = (): void => {
    if (!spot?.boulder || mode !== 'bank') return;
    bankView.pried();
    if (creek.pry(spot.id)) hud.toast('The boulder rolls free.');
  };
  const bail = (): void => {
    if (spot && mode === 'bank') creek.bail(spot.id);
  };

  const pickSpot = (picked: DigSpot): void => {
    spot = picked;
    bankView.setSpot(creek, picked);
    setMode('bank');
  };
  const regionMap = new RegionMapView(region, (place) => (place.kind === 'town' ? walkToTown() : goToCreek(place.creek)));
  const creekMap = new CreekMapView(creek, pickSpot);
  const openDrywasher = (): void => {
    if (!drywasherHere()) return;
    drywasherView.reset();
    input.tilt = 0.5;
    input.shakeHeld = false;
    setMode('drywasher');
    if (!toldAboutDrywasher) {
      toldAboutDrywasher = true;
      hud.toast(
        usingTouch()
          ? 'Hold Pump to work the bellows, and set the Air slider so the light sand drifts off in dust while the heavies stay behind the riffles.'
          : 'Hold Pump (or Space) to work the bellows, and set the Air (W/S) so the light sand drifts off in dust while the heavies stay behind the riffles.',
      );
    }
  };
  const openHighbanker = (): void => {
    if (!highbankerHere()) return;
    highbankerView.reset();
    setMode('highbanker');
    if (!toldAboutHighbanker) {
      toldAboutHighbanker = true;
      hud.toast(
        usingTouch()
          ? 'Prime the pump, start the engine, then set the throttle and shovel into the hopper. Watch the heat and the fuel.'
          : 'Prime the pump (P), start the engine (E), then set the Throttle and shovel into the hopper (F). Watch the heat and the fuel.',
      );
    }
  };
  const openSluice = (): void => {
    if (!sluiceHere()) return;
    sluiceView.reset();
    setMode('sluice');
  };
  const rakeSluice = (): void => {
    const sluice = sluiceHere();
    if (!sluice || sluice.clog <= 0) return;
    if (sluice.rake()) hud.toast('The jam breaks loose and the water runs again.');
  };
  const openClassifier = (): void => {
    if (!classifierHere()) return;
    input.tilt = 0;
    input.shakeHeld = false;
    setMode('classifier');
  };
  const openRocker = (): void => {
    if (!rockerHere()) return;
    rockerView.reset();
    setMode('rocker');
    if (!toldAboutRocker) {
      toldAboutRocker = true;
      hud.toast(
        usingTouch()
          ? 'Ladle water over the screen, then tap Rock on a steady beat, about once a second. Too fast or too wet and gold goes out the end.'
          : 'Ladle water over the screen (L), then rock it with Space on a steady beat, about once a second. Too fast or too wet and gold goes out the end.',
      );
    }
  };
  /** Steady creek water nearby (a bend) makes for a short trip to fill the bucket; a thin creek, a long one. */
  /** Seconds to fill the rocker's bucket here: quick by steady water, slow by a thin creek, slowest hauling to a dry wash. */
  const fetchSecondsHere = (): number => {
    const site = creek.profile.site;
    // A plain stretch with a steady sluice site nearby (a save from before site kinds) counts as steady water.
    if (site === 'creekStretch' && creek.sluiceSpots.some((s) => !needsPump(s.sluiceSite!))) return traitsOf('creekBend').fetchSeconds;
    return traitsOf(site).fetchSeconds;
  };
  const rockerActions = {
    rock: (): void => {
      const rocker = rockerHere();
      if (!rocker || mode !== 'rocker' || fetchingWater !== null) return;
      const stroke = rocker.rock();
      rockerView.stroked(stroke);
      rockerCoach.stroke(stroke, rocker);
    },
    ladle: (): void => {
      const rocker = rockerHere();
      if (!rocker || mode !== 'rocker' || fetchingWater !== null) return;
      if (rocker.ladle()) rockerView.poured();
      else hud.toast(usingTouch() ? 'The bucket is empty. Fetch water.' : 'The bucket is empty. Fetch water (E).');
    },
  };
  const bankView = new BankView(creek, { shovel, pry, bail, openSluice, openClassifier, openRocker, openHighbanker, openDrywasher });
  const rockerView = new RockerView(rockerActions);
  const classifierView = new ClassifierView({
    inspectRock: (rockId) => {
      const picker = classifierHere()?.inspectRock(rockId);
      if (picker) {
        session.vial.push(picker);
        hud.toast(`A picker was wedged in that rock! ${picker.mg.toFixed(1)} mg into the vial.`);
      }
    },
  });
  const sluiceView = new SluiceView({ rake: rakeSluice });
  const clearHighbanker = (): void => {
    const hb = highbankerHere();
    if (!hb) return;
    if (hb.jammed) {
      const rocks = hb.clearGrizzly();
      hud.toast(`You lever the jammed rock off the grizzly${rocks > 1 ? ` and clear ${rocks - 1} more` : ''}. The hopper runs again.`);
    } else if (hb.sluice.clog > 0) {
      if (hb.sluice.rake()) hud.toast('The jam breaks loose and the water runs again.');
    }
  };
  const highbankerView = new HighbankerView({ rake: clearHighbanker, clearGrizzly: clearHighbanker });
  const drywasherView = new DrywasherView();
  const magnetView = new MagnetView();
  const scene = new CreekScene();
  const panView = new PanView();
  const townView = new TownView();
  app.stage.addChild(regionMap, creekMap, bankView, sluiceView, highbankerView, drywasherView, classifierView, rockerView, townView, magnetView, scene, panView);

  const layout = (): void => {
    const { width, height } = app.screen;
    regionMap.layout(width, height);
    creekMap.layout(width, height);
    bankView.layout(width, height);
    sluiceView.layout(width, height);
    highbankerView.layout(width, height);
    drywasherView.layout(width, height);
    classifierView.layout(width, height);
    rockerView.layout(width, height);
    townView.layout(width, height);
    magnetView.layout(width, height);
    scene.resize(width, height);
    panView.layout(width, height, width / 2, scene.waterTop + (height - scene.waterTop) * 0.45);
  };
  layout();
  app.renderer.on('resize', layout);

  const hud = new Hud({
    reveal: () => {
      const pan = session.pan;
      if (pan && coach.allowReveal(pan)) pan.reveal();
    },
    collect,
    backToHole: () => setMode(mode === 'pan' && panReturn === 'town' ? 'town' : 'bank'),
    serviceMachine: () => {
      const machine =
        mode === 'sluice' ? sluiceHere() : mode === 'highbanker' ? highbankerHere() : mode === 'rocker' ? rockerHere() : mode === 'drywasher' ? drywasherHere() : null;
      if (!machine) return;
      if (session.repairKits <= 0) return hud.toast(`No repair kit to hand. The outfitter sells them, $${REPAIR_KIT.price} each.`);
      session.service(machine);
      passTime(WEAR_TUNING.crewServiceTime);
      hud.toast(
        mode === 'highbanker'
          ? 'You service the engine and pump and fit fresh moss. It runs like new.'
          : mode === 'rocker'
            ? 'You patch the canvas and fit new riffles. The apron will hold the fines again.'
            : mode === 'drywasher'
              ? 'You fit a new cloth and riffle tray. The air comes through even again.'
              : 'You fit fresh moss and tighten the riffles. The box will hold the fines again.',
      );
    },
    buyRepairKit: () => {
      const result = buyRepairKit(session);
      if (result === 'bought') hud.toast(`A repair kit. You're carrying ${session.repairKits}. Use one at any worn machine, or leave them for your crew.`);
      else if (result === 'full') hud.toast("You can't carry any more kits.");
      else hud.toast("You can't afford that yet.");
    },
    snuff: () => {
      snuffAt(snuffNext);
      snuffNext = snuffNext >= 0.85 ? 0.05 : snuffNext + 0.2;
    },
    openSluice,
    rakeSluice,
    openClassifier,
    swapScreen: () => {
      const c = classifierHere();
      if (c) c.setScreen(c.screen === 'coarse' ? 'fine' : 'coarse');
    },
    tipOff: () => {
      const c = classifierHere();
      if (!c?.hasLoad) return;
      const rocks = c.rocks.length;
      const unsifted = !c.screened;
      c.tipOff();
      // Say what was tipped, never what it held: a picker left in a rock stays unknown.
      hud.toast(
        unsifted
          ? 'You tip the whole load off, unsifted gravel and all.'
          : rocks > 0
            ? `You tip ${rocks} rock${rocks === 1 ? '' : 's'} onto the spoil pile.`
            : 'The screen is clear.',
      );
    },
    panBucket: () => {
      if (!classifierHere() || !session.panIsFree) return;
      if (!canPanHere()) return hud.toast(noPanWater());
      if (!session.startScreenedPan(panWater(0.1))) return;
      panSpot = spot;
      panLayer = null;
      startPanning();
    },
    openRocker,
    rock: rockerActions.rock,
    ladle: rockerActions.ladle,
    fetchWater: () => {
      const rocker = rockerHere();
      if (!rocker || mode !== 'rocker' || fetchingWater !== null) return;
      if (rocker.bucket >= ROCKER_TUNING.bucketLadles) return hud.toast('The bucket is already full.');
      fetchTotal = fetchSecondsHere();
      fetchingWater = fetchTotal;
      if (traitsOf(creek.profile.site).water === 'dry') hud.toast('No water in a dry wash: this is a long haul to fill the bucket.');
      else if (fetchTotal > traitsOf('creekBend').fetchSeconds) hud.toast('The creek runs thin here: it takes a while to fill the bucket.');
    },
    tipRocker: () => {
      const rocker = rockerHere();
      if (!rocker?.hasLoad || mode !== 'rocker') return;
      const unwashed = !rocker.screened;
      const rocks = rocker.hopperRocks;
      rocker.tipOff();
      hud.toast(unwashed ? 'You tip the screen off, unwashed gravel and all.' : `You tip ${rocks} rock${rocks === 1 ? '' : 's'} off the screen.`);
    },
    cleanUpRocker: () => {
      const rocker = rockerHere();
      if (!rocker || mode !== 'rocker') return;
      if (rocker.apronVolume < 0.001 && rocker.apronGoldCount === 0) return hud.toast('The apron is clean: nothing to wash up yet.');
      if (!session.fitsInJar(rocker.apronVolume)) return hud.toast('Your jar is too full for the apron. Pan some of the jar down first (J).');
      session.addConcentrate(rocker.cleanUp());
      hud.toast('You lift the apron and scrape the riffles, and wash it all into your jar. Pan it to see what the rocker caught.');
    },
    pourIntoRocker: () => {
      const c = classifierHere();
      const rocker = rockerHere();
      if (!c || !rocker || mode !== 'rocker') return;
      if (rocker.hopperFull) return hud.toast('The screen is heaped full. Rock it through first.');
      const material = c.pour(rocker.hopperRoom);
      if (material) rocker.feedScreened(material);
    },
    pourIntoSluice: (): void => {
      const c = classifierHere();
      const sluice = sluiceHere();
      if (!c || !sluice || cleaningOut) return;
      if (sluice.feedBlocked) {
        hud.toast(sluice.feedBlocked === 'jammed' ? 'The intake is jammed. Rake it clear first.' : 'The header is brim full. Give the water a moment.');
        return;
      }
      const material = c.pour(sluice.headerRoom);
      if (material) sluice.feedScreened(material);
    },
    setWater: (flow) => {
      if (highbankerHere()) throttle = flow;
      else sluiceFlow = flow;
    },
    openHighbanker,
    openDrywasher,
    knockScreen: () => {
      const dw = drywasherHere();
      if (!dw || dw.screenClog <= 0) return;
      dw.knockScreen();
      hud.toast('You rap the frame and the dry clay falls out of the mesh.');
    },
    shakeOutDust: () => {
      const dw = drywasherHere();
      if (!dw || dw.dust <= 0) return;
      dw.shakeOutDust();
      hud.toast('You beat the dust out of the cloth in a brown cloud. The air comes through strong again.');
    },
    tipDrywasher: () => {
      const dw = drywasherHere();
      if (!dw?.hasLoad) return;
      const unworked = !dw.screened;
      const rocks = dw.hopperRocks;
      dw.tipOff();
      hud.toast(unworked ? 'You tip the screen off, unworked gravel and all.' : `You tip ${rocks} rock${rocks === 1 ? '' : 's'} off the screen.`);
    },
    pullDrawer: () => {
      const dw = drywasherHere();
      if (!dw) return;
      if (dw.drawerVolume < 0.001 && dw.drawerGoldCount === 0) return hud.toast('The drawer is empty.');
      if (!session.fitsInJar(dw.drawerVolume)) return hud.toast('Your jar is too full for the drawer. Pan some of the jar down first.');
      session.addConcentrate(dw.pullDrawer());
      hud.toast(`You pull the drawer and tip the concentrate into your jar. Pan it to see what the drywasher caught${tubHere() ? '' : ', in a wash tub or back at a creek'}.`);
    },
    pourIntoDrywasher: () => {
      const c = classifierHere();
      const dw = drywasherHere();
      if (!c || !dw) return;
      if (dw.hopperFull) return hud.toast('The screen is heaped full.');
      const material = c.pour(dw.hopperRoom);
      if (material) dw.feedScreened(material);
    },
    changeTubWater: () => {
      const tub = tubHere();
      if (!tub || tubFetching !== null) return;
      if (tub.water >= 1 && tub.turbidity <= 0) return hud.toast('The tub is full of clean water already.');
      tubFetchTotal = fetchSecondsHere();
      tubFetching = tubFetchTotal;
      hud.toast('You tip out the muddy water and set off to haul fresh. It is a long way to water from here.');
    },
    setUpHighbanker: () => {
      if (!spot || mode !== 'bank') return;
      const blockedClaim = claimBlock();
      if (blockedClaim) return hud.toast(blockedClaim);
      const before = session.highbankerPlace;
      const result = session.setUpHighbanker(creek, spot);
      if (result === 'jarFull') return hud.toast("Your jar can't hold the highbanker's mat, so it can't come down yet. Pan some of the jar first.");
      if (result === 'noRoom') return hud.toast('No room or water for a highbanker here. It needs strong water and a stand on the bank: a creek bend, a gravel bar, or a ravine.');
      if (result === 'occupied') return hud.toast('Your hand sluice is set up here. Take it down first, or set the highbanker up by another spot.');
      if (result !== 'set') return;
      primingLeft = null;
      const moved = before !== null && (before.creekId !== creek.id || before.spotId !== spot.id);
      hud.toast(
        `${moved ? `You take the highbanker down at ${region.creek(before.creekId).profile.name}, wash its mat into your jar, and carry it here. ` : ''}` +
          `The highbanker stands on the bank, its hose in the creek. ${usingTouch() ? 'Prime the pump and start the engine.' : 'Prime the pump (P) and start the engine (E).'}`,
      );
    },
    takeDownHighbanker: () => {
      if (!highbankerHere()) return;
      if (session.takeDownHighbanker() === 'jarFull') return hud.toast("Your jar can't hold the highbanker's mat. Pan some of the jar first.");
      primingLeft = null;
      setMode('bank');
      hud.toast('You shut it down and pack the highbanker. Its mat is washed into your jar; gravel in the hopper is tipped out.');
    },
    primePump: () => {
      const hb = highbankerHere();
      if (!hb || primingLeft !== null) return;
      if (hb.primed) return hud.toast('The pump is already primed.');
      primingLeft = HIGHBANKER_TUNING.primeSeconds;
    },
    toggleEngine: () => {
      const hb = highbankerHere();
      if (!hb) return;
      if (hb.running) return hb.stop();
      const result = hb.start();
      if (result === 'noFuel') hud.toast(usingTouch() ? 'The tank is dry. Refuel it first.' : 'The tank is dry. Refuel it first (G).');
      else if (result === 'tooHot') hud.toast('The engine is still too hot to start. Give it a minute to cool.');
      else if (result === 'seized') hud.toast(usingTouch() ? 'The engine has seized: worn out. Mend it with a repair kit.' : 'The engine has seized: worn out. Mend it with a repair kit (N).');
      else if (result === 'started' && !hb.primed) hud.toast("The engine catches, but the pump isn't primed: no water, and it will overheat running dry.");
    },
    clearHighbanker,
    refuelHighbanker: () => {
      if (!highbankerHere()) return;
      const result = session.refuelHighbanker();
      if (result === 'refuelled') hud.toast(`You fill the tank. ${session.fuelCans} can${session.fuelCans === 1 ? '' : 's'} left.`);
      else if (result === 'noCans') hud.toast('No fuel cans left. The outfitter in town sells them.');
      else if (result === 'full') hud.toast("The tank is still mostly full. Top it up once it's running low.");
    },
    highbankerCleanout: () => {
      const hb = highbankerHere();
      if (!hb) return;
      hb.rinsing = true;
      hud.toast('The hopper holds back while clean water rinses the riffles. Lift the mat when the gravel has washed off.');
    },
    cancelHighbankerCleanout: () => {
      const hb = highbankerHere();
      if (hb) hb.rinsing = false;
    },
    liftHighbankerMat: () => {
      const hb = highbankerHere();
      if (!hb?.rinsing) return;
      if (!session.fitsInJar(hb.sluice.matVolume)) return hud.toast('Your jar is too full for this mat. Pan some of the jar down first (J).');
      session.addConcentrate(hb.sluice.liftMat());
      hb.rinsing = false;
      highbankerView.reset();
      hud.toast('The mat comes up dark and heavy. You wash it into your jar: pan the concentrate to see what the highbanker caught.');
    },
    pourIntoHighbanker: () => {
      const c = classifierHere();
      const hb = highbankerHere();
      if (!c || !hb || hb.rinsing) return;
      if (hb.hopperFull) return hud.toast('The hopper is heaped full.');
      const material = c.pour(hb.hopperRoom);
      if (material) hb.feedScreened(material);
    },
    setSlope: (slope) => sluiceHere()?.setSlope(slope),
    refuelPump: () => {
      if (!sluiceHere()?.usesPump) return;
      const result = session.refuelPump();
      if (result === 'refuelled') hud.toast(`You pour a can into the pump's tank. The engine picks up. ${session.fuelCans} can${session.fuelCans === 1 ? '' : 's'} left.`);
      else if (result === 'noCans') hud.toast('No fuel left to pour. The outfitter in town sells it by the can.');
      else if (result === 'full') hud.toast("The tank is still mostly full. Pour a can in once it's running low.");
    },
    setUpSluice: () => {
      if (!spot || mode !== 'bank') return;
      const before = session.sluicePlace;
      const blockedClaim = claimBlock();
      if (blockedClaim) return hud.toast(blockedClaim);
      const result = session.setUpSluice(creek.id, spot);
      if (result === 'jarFull') {
        hud.toast("Your jar can't hold the sluice's moss, so it can't come down yet. Pan some of the jar first.");
        return;
      }
      if (result === 'needsPump') {
        hud.toast("There's room and a drop here, but the creek is only a trickle. A sluice needs a pump to run here.");
        return;
      }
      if (result !== 'set') return;
      cleaningOut = false;
      const moved = before !== null && (before.creekId !== creek.id || before.spotId !== spot.id);
      hud.toast(
        `${moved ? `You take the sluice down at ${region.creek(before.creekId).profile.name}, wash its moss into your jar, and carry it here. ` : ''}` +
          'The sluice is set in the creek beside this spot. Drag shovelfuls into its header (F), or tap it for a close look.' +
          (sluiceHere()?.usesPump
            ? session.sluiceKit.pump!.fuel > 0
              ? ' The pump draws from a settling pool to feed it.'
              : ' The pump is set to feed it from a settling pool, but its tank is dry: refuel it (G).'
            : ''),
      );
    },
    takeDownSluice: () => {
      if (!sluiceHere()) return;
      if (session.takeDownSluice() === 'jarFull') {
        hud.toast("Your jar can't hold the sluice's moss, so it can't come down yet. Pan some of the jar first.");
        return;
      }
      cleaningOut = false;
      setMode('bank');
      hud.toast('You take the sluice down and pack it. Its moss is washed into your jar; gravel left in the header is tipped out.');
    },
    startCleanout: () => {
      if (!sluiceHere()) return;
      cleaningOut = true;
      hud.toast('Feeding stopped. Let clean water rinse the gravel off the riffles, then lift the mat. Too short leaves gravel to pan; too long strips fines.');
    },
    cancelCleanout: () => (cleaningOut = false),
    liftMat: () => {
      const sluice = sluiceHere();
      if (!sluice || !cleaningOut) return;
      if (!session.fitsInJar(sluice.matVolume)) {
        hud.toast('Your jar is too full for this mat. Pan some of the jar down first (J); the mat can wait in the rinse.');
        return;
      }
      session.addConcentrate(sluice.liftMat());
      cleaningOut = false;
      sluiceView.reset();
      hud.toast('The mat comes up dark and heavy. You wash it into your jar: pan the concentrate to see what the sluice caught.');
    },
    setTilt: (tilt) => (input.tilt = tilt),
    setShake: (held) => (input.shakeHeld = held),
    shovel,
    pry,
    bail,
    walkCreek: () => {
      if (mode === 'town') passTime(ECONOMY_TUNING.travel.town);
      setMode('creek');
    },
    walkToTown,
    openRegion: () => {
      // Leaving town is a walk out, whichever way the player heads from the map.
      if (mode === 'town') passTime(ECONOMY_TUNING.travel.town);
      setMode('region');
    },
    buyLead: (leadId) => {
      const no = refused('lead');
      if (no) return hud.toast(no);
      const lead = region.buy(leadId, session);
      if (lead) hud.toast(`Bought: ${lead.name}. Follow it from your notebook on the region map.`);
      else hud.toast("You can't afford that yet.");
      checkBooks();
    },
    followLead: (leadId) => {
      if (region.lead(leadId).status !== 'open') return;
      passTime(ECONOMY_TUNING.travel.lead);
      const result = region.follow(leadId);
      economy.stakeFound(region);
      hud.toast(describeFollow(result));
    },
    buyGear: (id) => {
      const no = refused('gear', OUTFITTER.find((g) => g.id === id)?.price ?? 0);
      if (no) return hud.toast(no);
      const result = buyGear(session, id);
      checkBooks();
      if (result === 'bought') hud.toast(BOUGHT_MESSAGES[id]);
      else if (result === 'cantAfford') hud.toast("You can't afford that yet.");
      else if (result === 'needsBase') hud.toast('That fits the hand sluice. Buy the sluice first.');
    },
    buyFuel: () => {
      const result = buyFuel(session);
      if (result === 'bought') hud.toast(`A can of fuel. You're carrying ${session.fuelCans}.`);
      else if (result === 'full') hud.toast("You can't carry any more cans.");
      else if (result === 'cantAfford') hud.toast("You can't afford that yet.");
    },
    sell: () => {
      if (mode !== 'town' || session.vial.length === 0) return;
      const sale = session.sellVial();
      hud.toast(`Sold for $${sale.total.toFixed(2)}. You have $${session.cash.toFixed(2)}.`);
      settleUp();
    },
    newCreek: () => {
      if (!window.confirm('Start over? Your creeks, leads, vial, jar, and cash will all be lost.')) return;
      clearSave();
      saveBlocked = true; // Stop the autosave (and pagehide) from writing this game back before the reload.
      window.location.reload();
    },
    openMagnet: () => {
      if (!session.owns('magnet')) return;
      if (mode !== 'town' && !(mode === 'bank' && region.allows(creek, 'magnet'))) {
        return hud.toast('The Home Creek bank is too narrow to spread out a tray. Use the magnet in town or on a stretch you found.');
      }
      if (session.jar.blackSand < MIN_CONCENTRATE) return hud.toast('Your jar is empty: nothing for the magnet to work on.');
      magnetReturn = mode === 'town' ? 'town' : 'bank';
      magnetView.reset();
      input.tilt = 0.4;
      input.shakeHeld = false;
      setMode('magnet');
      if (!toldAboutMagnet) {
        toldAboutMagnet = true;
        hud.toast('Hold Pass (or Space) to sweep the magnet over the sand. Closer strips faster but drags fine gold up too. Shake the clump back before you strip it off.');
      }
    },
    shakeClump: () => {
      if (mode !== 'magnet' || session.clump.sand <= 0) return;
      session.shakeClumpBack();
    },
    stripClump: () => {
      if (mode !== 'magnet' || session.clump.sand <= 0) return;
      magnetView.stripped(session.clump.sand);
      session.stripClump(); // Whatever gold was in it goes with it, unannounced.
    },
    closeMagnet: () => {
      if (mode !== 'magnet') return;
      if (session.clump.sand > 0) {
        session.dropClump();
        hud.toast('You tap the clump back into the tray and pour it all into the jar.');
      }
      setMode(magnetReturn);
    },
    hireApplicant: (applicantId) => {
      const no = refused('hire');
      if (no) return hud.toast(no);
      const result = crew.hireApplicant(session, false, applicantId);
      checkBooks();
      const hand = crew.workers[crew.workers.length - 1];
      if (result === 'hired' && hand) {
        const role = hand.role;
        hud.toast(
          `${hand.name} signs on as ${role === 'operator' ? 'an operator' : role === 'foreman' ? 'a foreman' : 'a hand'} at $${hand.wage} a day, first day paid, and waits in town. ` +
            (role === 'operator'
              ? 'Operators can run the sluice, highbanker and drywasher, or lend a hand at anything else.'
              : role === 'foreman'
                ? 'Send them to a stretch: they take no job, and lift the whole crew there as far as your field notes cover the ground.'
                : 'Hands pan, rock, haul, screen, prospect and finish; the sluice, highbanker and drywasher need an operator.'),
        );
      }
      else if (result === 'cantAfford') hud.toast("You can't afford the first day's wage yet.");
    },
    dismissHand: (workerId) => {
      const hand = crew.dismiss(workerId);
      if (hand) hud.toast(`${hand.name} collects their things and heads off.${crew.wagesOwed > 0 ? ' Wages still owed stay owed.' : ''}`);
    },
    sendHand: (creekId, role) => {
      const target = region.creek(creekId);
      const result = crew.send(target, economy, region.home.id, role);
      const name = target.profile.name;
      if (result === 'sent' && role === 'foreman') hud.toast(`Your foreman sets off for ${name}. The more of it you've sampled, the more they can do with the crew there.`);
      else if (result === 'sent') hud.toast(`${role === 'operator' ? 'An operator' : 'A hand'} sets off for ${name}. They'll take the first job on its list that nobody has and they can do.`);
      else if (result === 'full') hud.toast(`${name} has no room or work for another hand.`);
      else if (result === 'hasForeman') hud.toast(`${name} already has a foreman.`);
      else if (result === 'noneFree') hud.toast(`No ${role === 'operator' ? 'operator' : role === 'foreman' ? 'foreman' : 'hand'} is waiting in town. Hire one, or call one back from another stretch.`);
      else if (result === 'claimLapsed') hud.toast(`Your claim on ${name} can't be worked until its fees are paid.`);
    },
    recallHand: (creekId) => {
      const hand = crew.recall(creekId);
      if (hand) hud.toast(`${hand.name} comes back to town.`);
    },
    setPolicy: (creekId, policy) => {
      if (crew.policyAt(creekId) === policy) return;
      crew.setPolicy(creekId, policy);
      const said: Record<typeof policy, string> = {
        steady: 'back to their usual pace',
        careful: 'to go carefully: slower, and less gold lost',
        push: 'to push hard: more ground a day, and more gold washed away',
        prepare: 'to prepare the ground: no washing, just opening up the pay gravel',
      };
      hud.toast(`You tell the crew at ${region.creek(creekId).profile.name} ${said[policy]}.`);
    },
    toggleJob: (creekId, job) => {
      const result = crew.toggleJob(region.creek(creekId), job);
      if (result === 'doesntFit') hud.toast("That work doesn't fit the ground there.");
    },
    buyCrewMachine: (machine) => {
      const no = refused('crewGear');
      if (no) return hud.toast(no);
      const result = crew.buyMachine(session, machine, false);
      checkBooks();
      if (result === 'bought') hud.toast(`A crew ${CREW_MACHINE_NAMES[machine]}. It waits as a spare until a crew job needs it.`);
      else hud.toast("You can't afford that yet.");
    },
    washReturned: () => {
      const moved = crew.washReturned(session);
      if (moved <= 0 && crew.returned.blackSand > 0) return hud.toast('Your jar is full. Pan some of it down first.');
      hud.toast(crew.returned.blackSand > 0 ? 'You wash what fits of what the crew brought back into your jar.' : 'You wash what the crew brought back into your jar.');
    },
    goToClaim: (creekId) => {
      if (mode === 'town') passTime(ECONOMY_TUNING.travel.town);
      goToCreek(region.creek(creekId));
    },
    releaseClaim: (creekId) => {
      const name = region.creek(creekId).profile.name;
      const result = economy.release(creekId, session);
      if (result === 'sluiceThere') hud.toast(`Your sluice is set up at ${name}. Take it down before releasing the claim.`);
      else if (result === 'released') {
        const hadCrew = crew.workersAt(creekId).length > 0 || crew.findSite(creekId) !== null;
        crew.closeSite(creekId);
        hud.toast(
          `You release your claim on ${name}. What you owed on it is written off. You can re-stake it later for $${ECONOMY_TUNING.restakeFee}.` +
            (hadCrew ? ' The crew there comes back to town with what they had.' : ''),
        );
      }
    },
    restakeClaim: (creekId) => {
      const no = refused('restake');
      if (no) return hud.toast(no);
      const result = economy.restake(creekId, session, false);
      checkBooks();
      if (result === 'staked') hud.toast(`You re-stake ${region.creek(creekId).profile.name}.`);
      else if (result === 'cantAfford') hud.toast(`Re-staking costs $${ECONOMY_TUNING.restakeFee}.`);
    },
    collectCrew: () => {
      const site = crew.findSite(creek.id);
      if (!site || (site.poke.length === 0 && site.bucket.blackSand <= 0 && site.bucket.gold.length === 0)) return;
      const got = crew.collect(creek.id, session);
      const parts = [
        got.gold > 0 ? `${plural(got.gold, 'piece')} of gold from their poke into your vial` : '',
        got.sand > 0 ? 'their concentrate into your jar' : '',
      ].filter(Boolean);
      if (parts.length === 0) return hud.toast('Your jar is full. Pan some of it down first (J), then collect the crew bucket.');
      hud.toast(`You collect ${parts.join(', and ')}.${got.sandLeft > 0 ? ' The rest of the bucket waits: your jar is full.' : ''}`);
    },
    panConcentrate: () => {
      if (mode === 'creek') return;
      // In town, a pan left half-washed at the trough is picked back up.
      if (mode === 'town' && session.pan && !session.panIsFree) return startPanning();
      if (!session.canPanConcentrate) return;
      if (!canPanHere()) return hud.toast(noPanWater());
      session.startConcentratePan(panWater(0), finishingHere());
      startPanning();
      hud.toast('Black sand is heavy and holds fine gold. Settle it, then sift with only a slight tip: a light touch keeps the gold in the pan.');
    },
    digSelected: () => {
      if (mode === 'creek' && creekMap.selected) pickSpot(creekMap.selected);
    },
    pickSpot: (index) => {
      const picked = creek.creekSpots[index];
      if (picked) pickSpot(picked);
    },
  });

  const coach = new PanCoach((message) => hud.toast(message));
  // Anything that throws (a click handler, a frame) is shown, not just logged to the console.
  showError = (message) => hud.toast(`Something went wrong: ${message}. Please tell the developer what you were doing.`);
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

  const input = new PanInput(
    app.canvas,
    (x, y) => {
      if (session.pan?.phase === 'revealed' && session.owns('snuffer')) {
        const at = panView.tailAt(x, y);
        if (at !== null) return snuffAt(at);
      }
      const rockId = panView.rockAt(x, y);
      if (rockId === null) return;
      const picker = session.rakeRock(rockId);
      if (picker) hud.toast(`A picker was wedged in that rock! ${picker.mg.toFixed(1)} mg into the vial.`);
    },
  );
  // Put the player back where they left off. A pan in progress always wins: it can't be set down.
  const pan = session.pan;
  const screen = loaded?.place.screen ?? 'creek';
  if (spot) bankView.setSpot(creek, spot);
  if (pan && pan.phase !== 'emptied') {
    if (screen === 'town') setMode('town'); // Picked back up at the town trough.
    setMode('pan');
  }
  else if (screen === 'town') {
    region.restockOffers(session.pansWorked);
    crew.refreshApplicants(economy.day);
    setMode('town');
  }
  else if (screen === 'region') setMode('region');
  else if (screen === 'sluice' && sluiceHere()) setMode('sluice');
  else if (screen === 'highbanker' && highbankerHere()) setMode('highbanker');
  else if (screen === 'drywasher' && spot && drywasherHere()) setMode('drywasher');
  else if (screen === 'classifier' && spot && classifierHere()) setMode('classifier');
  else if (screen === 'rocker' && spot && rockerHere()) setMode('rocker');
  else if ((screen === 'bank' || screen === 'pan' || screen === 'sluice' || screen === 'classifier' || screen === 'rocker' || screen === 'highbanker' || screen === 'drywasher') && spot) setMode('bank');
  else setMode('creek');
  // Nothing is held up on the magnet between visits.
  if (session.clump.sand > 0 || session.clump.gold.length > 0) session.dropClump();
  if (loaded) hud.toast(`Welcome back. ${session.vialMg.toFixed(1)} mg in the vial.`);

  let saveBlocked = false;
  let warnedStorage = false;
  const save = (): void => {
    if (saveBlocked) return;
    const ok = writeSave(createSave(region, session, { screen: mode === 'magnet' ? magnetReturn : mode === 'pan' && panReturn === 'town' ? 'town' : mode, creekId: creek.id, spotId: spot?.id ?? null }, Date.now(), { economy, crew, finance }));
    if (!ok && !warnedStorage) {
      warnedStorage = true;
      hud.toast("This browser won't let the game save, so progress will be lost when you close it.");
    }
  };
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  let sinceSave = 0;

  // Dev-only handle for inspecting state from the browser console or test scripts.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __game: { session, region, economy, crew, finance, passTime, get creek() { return creek; }, get mode() { return mode; }, pickSpot: (id: number) => pickSpot(creek.spot(id)), creekMap, regionMap, panView, classifierView },
    });
  }

  const sluiceCoach = new SluiceCoach((message) => hud.toast(message));
  const highbankerCoach = new HighbankerCoach((message) => hud.toast(message));
  const drywasherCoach = new DrywasherCoach((message) => hud.toast(message));
  const rockerCoach = new RockerCoach((message) => hud.toast(message));

  /** Time stops after this long without input, so an idle tab neither earns nor owes. */
  const IDLE_AFTER_MS = 20_000;
  let lastInput = performance.now();
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel']) {
    window.addEventListener(type, () => (lastInput = performance.now()), { capture: true, passive: true });
  }

  let accumulator = 0;
  let sluiceAccumulator = 0;
  let classifierAccumulator = 0;
  let magnetAccumulator = 0;
  let hbAccumulator = 0;
  let dwAccumulator = 0;
  /** Said once per fill: sifting into a full bucket does nothing, and tipping off would lose the load. */
  let toldBucketFull = false;
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const controls = input.sample(dt);

    // Game time runs while the player is out working and has touched something lately; not in
    // town or on the map (those are paid for as travel), and not while the game sits idle.
    if (!inTown() && mode !== 'region' && !hud.tabletOpen && performance.now() - lastInput < IDLE_AFTER_MS) passTime(dt);
    // In town, anything owed is paid the moment there's cash for it, not just on arrival.
    if (mode === 'town' && session.cash >= 0.01 && (economy.feesOwed > 0 || crew.wagesOwed > 0)) settleUp();
    creekMap.setStatus(claimBlock() ? (economy.claim(creek.id)?.status === 'released' ? 'claim released' : 'claim lapsed: pay fees in town') : null);
    regionMap.setClaimStatus((c) => (economy.claim(c.id)?.status === 'released' ? 'released' : economy.canWork(c.id) ? 'held' : 'lapsed'));
    const crewHere = crew.findSite(creek.id);
    bankView.setCrewBucket(crewHere ? crewHere.bucket.blackSand + (crewHere.poke.length > 0 ? 0.01 : 0) : 0);

    // The sluice runs whenever the player is at its spot (digging, watching it, or panning beside it).
    const sluice = sluiceHere();
    let stepped: SluiceStepEvents | null = null;
    if (sluice && (mode === 'bank' || mode === 'sluice' || mode === 'pan')) {
      sluiceAccumulator += dt;
      let released = 0;
      let goldLost = 0;
      let blackLost = 0;
      let glints = 0;
      while (sluiceAccumulator >= SIM_DT) {
        sluiceAccumulator -= SIM_DT;
        const e = sluice.step(SIM_DT, { flow: sluiceFlow });
        released += e.released;
        goldLost += e.goldLost;
        blackLost += e.blackLost;
        glints += e.glints;
        stepped = { ...e, released, goldLost, blackLost, glints };
      }
      if (stepped) sluiceEvents = stepped;
      if (mode !== 'pan') sluiceCoach.update(dt, sluice, stepped);
    } else if (!sluice) {
      sluiceEvents = null;
      if (mode === 'sluice') setMode('bank');
    }
    bankView.setSluice(sluice, stepped);

    // The highbanker runs, like the sluice, whenever the player is at its spot.
    const highbanker = highbankerHere();
    if (highbanker && (mode === 'bank' || mode === 'highbanker' || mode === 'pan')) {
      if (primingLeft !== null && (primingLeft -= dt) <= 0) {
        primingLeft = null;
        highbanker.prime();
      }
      hbAccumulator += dt;
      let merged: HighbankerStepEvents | null = null;
      while (hbAccumulator >= SIM_DT) {
        hbAccumulator -= SIM_DT;
        merged = mergeHighbankerEvents(merged, highbanker.step(SIM_DT, throttle));
      }
      if (merged) highbankerEvents = merged;
      if (mode !== 'pan') highbankerCoach.update(dt, highbanker, merged);
    } else if (!highbanker) {
      highbankerEvents = null;
      primingLeft = null;
      if (mode === 'highbanker') setMode('bank');
    }
    bankView.setHighbanker(highbanker);
    const drywasher = drywasherHere();
    bankView.setDryGear(drywasher, tubHere());
    if (mode === 'drywasher' && !drywasher) setMode('bank');
    // Hauling water for the tub goes on while the player stays at this stretch.
    if (tubFetching !== null && (tubFetching -= dt) <= 0) {
      tubFetching = null;
      const tub = tubHere();
      if (tub) {
        refillTub(tub);
        hud.toast('You fill the tub with clean water.');
      }
    }
    const classifier = classifierHere();
    bankView.setClassifier(classifier);
    if (mode === 'classifier' && !classifier) setMode('bank');
    const rocker = rockerHere();
    bankView.setRocker(rocker);
    if (mode === 'rocker' && !rocker) setMode('bank');

    let events: PanStepEvents | null = null;
    const pan = session.pan;
    if (mode === 'pan' && pan) {
      accumulator += dt;
      let darkSpilled = 0;
      let lightSpilled = 0;
      let glints = 0;
      let goldLost = 0;
      while (accumulator >= SIM_DT) {
        accumulator -= SIM_DT;
        const e = pan.step(SIM_DT, controls);
        darkSpilled += e.darkSpilled;
        lightSpilled += e.lightSpilled;
        glints += e.glints;
        goldLost += e.goldLost;
        events = { ...e, darkSpilled, lightSpilled, glints, goldLost };
      }
      coach.update(dt, pan, controls, events);
      scene.setMurk(pan.waterMurk);
      scene.update(dt);
      const bucketHere = classifierHere();
      panView.update(dt, session, controls, events, bucketHere ? { volume: bucketHere.bucketVolume, capacity: CLASSIFIER_TUNING.bucketCapacity } : null);
    } else if (mode === 'bank') {
      bankView.update(dt);
    } else if (mode === 'classifier' && classifier) {
      classifierAccumulator += dt;
      let passed = 0;
      while (classifierAccumulator >= SIM_DT) {
        classifierAccumulator -= SIM_DT;
        passed += classifier.step(SIM_DT, controls.shake);
      }
      classifierView.update(dt, classifier, controls.shake > 0, passed);
      if (!classifier.bucketFull) toldBucketFull = false;
      else if (!toldBucketFull && controls.shake > 0 && classifier.passable > 0.005) {
        toldBucketFull = true;
        hud.toast(`The bucket is full, so nothing more can fall through. Pan from the bucket${sluiceHere() ? ' or pour it into the sluice' : ''} to make room; tipping off now would lose the unsifted gravel.`);
      }
    } else if (mode === 'sluice' && sluice) {
      sluiceView.keepOut = hud.inspectBounds();
      sluiceView.update(dt, sluice, stepped, sluiceFlow);
    } else if (mode === 'drywasher' && drywasher) {
      dwAccumulator += dt;
      let merged: DrywasherStepEvents | null = null;
      while (dwAccumulator >= SIM_DT) {
        dwAccumulator -= SIM_DT;
        const e = drywasher.step(SIM_DT, controls.shake > 0, controls.tilt);
        merged = merged
          ? { ...e, passed: e.passed + merged.passed, blown: e.blown + merged.blown, goldLost: e.goldLost + merged.goldLost, glint: e.glint || merged.glint }
          : e;
      }
      if (merged) drywasherEvents = merged;
      drywasherCoach.update(dt, drywasher, merged);
      drywasherView.update(dt, drywasher, controls.shake > 0, controls.tilt, merged);
    } else if (mode === 'highbanker' && highbanker) {
      highbankerView.update(dt, highbanker, highbankerEvents, throttle, primingLeft === null ? null : 1 - primingLeft / HIGHBANKER_TUNING.primeSeconds);
    } else if (mode === 'rocker' && rocker) {
      rocker.step(dt);
      if (fetchingWater !== null && (fetchingWater -= dt) <= 0) {
        fetchingWater = null;
        rocker.fillBucket();
      }
      rockerCoach.update(dt, rocker);
      rockerView.update(dt, rocker, fetchingWater === null ? null : 1 - fetchingWater / fetchTotal);
    } else if (mode === 'magnet') {
      magnetAccumulator += dt;
      let lifted = 0;
      let goldLifted = 0;
      while (magnetAccumulator >= SIM_DT) {
        magnetAccumulator -= SIM_DT;
        if (controls.shake <= 0) continue;
        const e = session.passMagnet(SIM_DT, controls.tilt);
        lifted += e.lifted;
        goldLifted += e.goldLifted;
      }
      const magnetEvents: MagnetStepEvents = { lifted, goldLifted };
      magnetView.update(dt, session, controls.shake > 0, controls.tilt, magnetEvents);
    } else if (mode === 'region') {
      regionMap.update(creek);
    } else if (mode === 'town') {
      townView.update(dt, session);
    } else {
      creekMap.update(dt);
    }
    hud.update(dt, {
      mode,
      session,
      region,
      creek,
      spot,
      selectedSpot: creekMap.selected,
      controls,
      events,
      sluice,
      sluiceEvents,
      sluiceFlow,
      highbanker,
      highbankerEvents,
      throttle,
      priming: primingLeft !== null,
      drywasher,
      drywasherEvents,
      tub: tubHere(),
      tubFetching: tubFetching !== null,
      cleaningOut,
      classifier: mode === 'pan' && panReturn === 'town' ? null : classifier,
      panInTown: mode === 'pan' && panReturn === 'town',
      canSnuff: mode === 'pan' && session.pan?.phase === 'revealed' && session.owns('snuffer') && finishingHere(),
      rocker,
      fetchingWater: fetchingWater !== null,
      canPan: canPanHere(),
      economy,
      crew,
      money: {
        state: finance.state(books()),
        daysToShutdown: finance.daysToShutdown(economy),
        owed: Finance.owed(books()),
        canHire: finance.allows('hire', books()),
        canCrewGear: finance.allows('crewGear', books()),
        canRestake: finance.allows('restake', books()),
      },
    });

    sinceSave += dt;
    if (sinceSave >= AUTOSAVE_SECONDS) {
      sinceSave = 0;
      save();
    }
  });


  const fullscreen = document.getElementById('fullscreen');
  if (fullscreen) {
    if (!document.fullscreenEnabled) fullscreen.remove();
    fullscreen.addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    });
  }
}

void start();
