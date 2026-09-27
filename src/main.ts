import { Application } from 'pixi.js';
import {
  PanningSession,
  Region,
  createRng,
  createSave,
  loadSave,
  buyGear,
  buyFuel,
  CLASSIFIER_TUNING,
  Crew,
  ECONOMY_TUNING,
  Economy,
  type CrewSite,
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
import { PanCoach, RockerCoach, SluiceCoach } from './game/coach';
import { Hud, type Mode } from './game/hud';
import { PanInput } from './game/panInput';
import { PanView } from './game/panView';
import { RegionMapView } from './game/regionMapView';
import { ClassifierView } from './game/classifierView';
import { SluiceView } from './game/sluiceView';
import { MagnetView } from './game/magnetView';
import { RockerView } from './game/rockerView';
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

const BOUGHT_MESSAGES: Record<GearId, string> = {
  sluice: 'A hand sluice, riffles and moss and all. It only sets up where a creek has steady water and a drop: look for a creek bend.',
  bigJar: 'A big concentrate jar: three times the room for black sand.',
  classifier: 'A hand classifier. Use it on the stretches you find; the Home Creek is too narrow for it.',
  riffleMat: 'A riffle insert and ribbed mat, fitted to your sluice. It holds fine gold better: you will see it at cleanout.',
  legs: 'Adjustable legs, fitted to your sluice. Set its slope with the Slope slider while it runs.',
  rocker: 'A rocker box. Set it up on any stretch you find: shovel gravel onto its screen, ladle water over it, and rock it on a steady beat.',
  magnet: 'A magnet in a plastic sleeve. Clean your jar with it here in town or out on a stretch: close is quick, but drags fine gold up with the sand.',
  pump: 'A recirculating pump. It lets the sluice run where the creek is too thin, if you keep it fuelled: buy fuel here by the can.',
};

async function start(): Promise<void> {
  const host = document.getElementById('game');
  if (!host) throw new Error('Missing #game element');

  // The first click is also the user gesture browsers require before audio can play. Listen right
  // away, before the renderer loads, so a quick click on a slow connection isn't lost.
  const overlay = document.getElementById('start');
  if (overlay && matchMedia('(pointer: coarse)').matches) overlay.textContent = 'Tap to start at the creek';
  overlay?.addEventListener('click', () => overlay.remove(), { once: true });

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
  const restricted = (): boolean => economy.anyLapsed || crew.wagesOverdue;
  const RESTRICTED_MESSAGE = "You're behind on claim fees or wages. Pay up here in town (sell some gold) or release a claim before buying anything new.";
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
  /** The classifier travels with the player, but the Home Creek has no room for it. */
  const classifierHere = (): Classifier | null => (session.classifier && region.allows(creek, 'classifier') ? session.classifier : null);
  /** The rocker travels with the player too, and likewise has no room at the Home Creek. */
  const rockerHere = (): Rocker | null => (session.rocker && region.allows(creek, 'rocker') ? session.rocker : null);
  /** A dry wash has no water to pan in. */
  const canPanHere = (): boolean => inTown() || region.allows(creek, 'pan');
  const NO_PAN_WATER = 'There is no water here to pan in. Haul water to a rocker box, or carry what you dig somewhere wetter.';
  /** Floods that happened while the player was elsewhere, to hear about on arrival. */
  const floodNews = new Set<number>();
  /** Fetching a bucket for the rocker: seconds left, and how long the trip takes here. */
  let fetchingWater: number | null = null;
  let fetchTotal = 1;
  let toldAboutRocker = false;
  /** Where the magnet was picked up from, to go back to when done. */
  let magnetReturn: 'town' | 'bank' = 'town';
  let toldAboutMagnet = false;
  /** In town, or at the magnet table there: time is covered by the trip, and the player isn't at any stretch. */
  const inTown = (): boolean => mode === 'town' || (mode === 'magnet' && magnetReturn === 'town');
  /** Where the pan's current shovelful came from, for field notes and gully colour. */
  let panSpot: DigSpot | null = session.pan?.kind === 'gravel' && session.pan.phase !== 'emptied' ? spot : null;

  const setMode = (next: Mode): void => {
    mode = next;
    if (mode !== 'creek') creekMap.selected = null;
    regionMap.visible = mode === 'region';
    creekMap.visible = mode === 'creek';
    bankView.visible = mode === 'bank';
    sluiceView.visible = mode === 'sluice';
    classifierView.visible = mode === 'classifier';
    townView.visible = mode === 'town';
    magnetView.visible = mode === 'magnet';
    scene.visible = panView.visible = mode === 'pan';
    rockerView.visible = mode === 'rocker';
    if (mode !== 'rocker') fetchingWater = null; // Walking off abandons the trip for water.
    input.enabled = mode === 'pan' || mode === 'classifier' || mode === 'magnet';
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
      (into === 'classifier' && mode === 'classifier') || (into === 'sluice' && mode === 'sluice') || (into === 'rocker' && mode === 'rocker');
    if (!spot || (mode !== 'bank' && !fromCloseUp)) return;
    const blockedClaim = claimBlock();
    if (blockedClaim) return hud.toast(blockedClaim);
    if (into === 'pan' && !canPanHere()) return hud.toast(NO_PAN_WATER);
    // A pan left half-washed (Esc back to the hole) has to be finished before another goes in.
    if (into === 'pan' && !session.panIsFree) {
      setMode('pan');
      return hud.toast('You still have a pan on the go. Finish it first.');
    }
    const sluice = into === 'sluice' ? sluiceHere() : null;
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
    } else if (result.load) {
      session.startPan(result.load);
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
    topsoilPans = panLayer === 'overburden' ? topsoilPans + 1 : 0;
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
        hud.toast(`Colour in the gully! You follow it upstream to ${traced.creek.profile.name} and stake a claim. It is on your region map (M).`);
      }
    }
  };

  const describeFollow = (result: FollowResult): string =>
    result.found
      ? `You find ${result.creek.profile.name} and stake a claim ($${economy.claim(result.creek.id)?.fee ?? 1} a day, paid in town). It is on your region map now.`
      : `You walk out to ${result.lead.name}, but there's nothing there. The ${result.lead.source === 'rumour' ? 'rumour' : 'lead'} was wrong.`;

  /**
   * Game time passes: claim fees and wages run up, and a hand works the sluice if the player is
   * elsewhere. Driven by active play and travel, never the wall clock.
   */
  const passTime = (seconds: number): void => {
    // Long stretches (travel) go in short steps, so a claim lapsing or a hand quitting partway
    // through takes effect from that moment on.
    for (let left = seconds; left > 1e-9; left -= 30) {
      const chunk = Math.min(30, left);
      economy.advance(chunk);
      const hand = crew.hand;
      if (crew.accrue(chunk) === 'quit' && hand) {
        hud.toast(`${hand.name} has walked off the job over unpaid wages. You still owe them; pay it in town.`);
      }
      crew.work(chunk, crewSite(), () => {
        const lead = region.clueFound();
        hud.toast(`Word from your hand: the shovel turned something up. ${lead.note} It points to ${lead.name}. Noted in your notebook.`);
      });
      for (const flooded of region.weather(chunk, session)) {
        if (flooded === creek && !inTown() && mode !== 'region') hud.toast(floodMessage(flooded, true));
        else floodNews.add(flooded.id);
      }
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

  /** Where the hand would work: wherever the sluice is set up, unless something stops them. */
  const crewSite = (): CrewSite | null => {
    const place = session.sluicePlace;
    if (!place) return null;
    const siteCreek = region.creek(place.creekId);
    const sluice = session.sluiceAt(place.creekId, place.spotId);
    if (!sluice) return null;
    const here = creek.id === place.creekId && !inTown() && mode !== 'region';
    const stopped = here ? 'playerHere' : !economy.canWork(place.creekId) ? 'claimLapsed' : null;
    return { creek: siteCreek, spot: siteCreek.spot(place.spotId), sluice, session, stopped };
  };

  /** Pay what's owed from cash on hand, fees first, and say what was paid. */
  const settleUp = (): void => {
    const fees = economy.payFees(session);
    const wages = crew.payWages(session);
    const parts = [fees > 0 ? `$${fees.toFixed(2)} in claim fees` : '', wages > 0 ? `$${wages.toFixed(2)} in wages` : ''].filter(Boolean);
    if (parts.length) hud.toast(`Paid ${parts.join(' and ')}.${restricted() ? " You're still behind." : ''}`);
  };

  const goToCreek = (next: Creek): void => {
    if (next !== creek) {
      spot = null;
      passTime(ECONOMY_TUNING.travel.creek + traitsOf(next.profile.site).access);
    }
    creek = next;
    creekMap.setCreek(next);
    setMode('creek');
    if (floodNews.delete(next.id)) hud.toast(floodMessage(next, false));
    // Back at the stretch the hand is working: hear what they did.
    if (crew.hand && session.sluicePlace?.creekId === next.id) {
      const report = crew.takeReport();
      if (report.seconds > 30) {
        const hours = Math.max(1, Math.round(report.seconds / (ECONOMY_TUNING.daySeconds / 10)));
        hud.toast(
          `${crew.hand.name} worked about ${hours} hour${hours === 1 ? '' : 's'} while you were gone: ` +
            `${report.shovelfuls} shovelfuls through the sluice, ${report.cleanouts} cleanout${report.cleanouts === 1 ? '' : 's'} in the crew bucket by the sluice.`,
        );
      }
    }
  };

  const walkToTown = (): void => {
    if (mode !== 'town') passTime(ECONOMY_TUNING.travel.town);
    region.restockOffers(session.pansWorked);
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
  const bankView = new BankView(creek, { shovel, pry, bail, openSluice, openClassifier, openRocker });
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
  const magnetView = new MagnetView();
  const scene = new CreekScene();
  const panView = new PanView();
  const townView = new TownView();
  app.stage.addChild(regionMap, creekMap, bankView, sluiceView, classifierView, rockerView, townView, magnetView, scene, panView);

  const layout = (): void => {
    const { width, height } = app.screen;
    regionMap.layout(width, height);
    creekMap.layout(width, height);
    bankView.layout(width, height);
    sluiceView.layout(width, height);
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
    backToHole: () => setMode('bank'),
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
      if (!canPanHere()) return hud.toast(NO_PAN_WATER);
      if (!session.startScreenedPan()) return;
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
    setWater: (flow) => (sluiceFlow = flow),
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
    openRegion: () => setMode('region'),
    buyLead: (leadId) => {
      if (restricted()) return hud.toast(RESTRICTED_MESSAGE);
      const lead = region.buy(leadId, session);
      if (lead) hud.toast(`Bought: ${lead.name}. Follow it from your notebook on the region map.`);
      else hud.toast("You can't afford that yet.");
    },
    followLead: (leadId) => {
      if (region.lead(leadId).status !== 'open') return;
      passTime(ECONOMY_TUNING.travel.lead);
      const result = region.follow(leadId);
      economy.stakeFound(region);
      hud.toast(describeFollow(result));
    },
    buyGear: (id) => {
      if (restricted()) return hud.toast(RESTRICTED_MESSAGE);
      const result = buyGear(session, id);
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
    hireHand: () => {
      const result = crew.hire(session, economy, region.home.id, restricted());
      const hand = crew.hand;
      if (result === 'hired' && hand) {
        const place = region.creek(session.sluicePlace!.creekId).profile.name;
        hud.toast(`${hand.name} signs on at $${hand.wage} a day, first day paid. They'll run your sluice at ${place} while you're away.`);
      } else if (result === 'restricted') hud.toast(RESTRICTED_MESSAGE);
      else if (result === 'cantAfford') hud.toast("You can't afford the first day's wage yet.");
      else if (result === 'noSluice' || result === 'homeCreek') hud.toast('A hand needs a sluice set up on one of your stretches to run.');
      else if (result === 'claimLapsed') hud.toast("The claim where your sluice stands has lapsed. Pay its fees first.");
    },
    dismissHand: () => {
      const hand = crew.hand;
      if (!hand) return;
      crew.dismiss();
      hud.toast(`${hand.name} collects their things and heads off.${crew.wagesOwed > 0 ? ' You still owe them wages.' : ''}`);
    },
    releaseClaim: (creekId) => {
      const name = region.creek(creekId).profile.name;
      const result = economy.release(creekId, session);
      if (result === 'sluiceThere') hud.toast(`Your sluice is set up at ${name}. Take it down before releasing the claim.`);
      else if (result === 'released') hud.toast(`You release your claim on ${name}. What you owed on it is written off. You can re-stake it later for $${ECONOMY_TUNING.restakeFee}.`);
    },
    restakeClaim: (creekId) => {
      const result = economy.restake(creekId, session, restricted());
      if (result === 'staked') hud.toast(`You re-stake ${region.creek(creekId).profile.name}.`);
      else if (result === 'restricted') hud.toast(RESTRICTED_MESSAGE);
      else if (result === 'cantAfford') hud.toast(`Re-staking costs $${ECONOMY_TUNING.restakeFee}.`);
    },
    washCrewBucket: () => {
      if (!sluiceHere() || crew.bucket.blackSand <= 0) return;
      const moved = crew.washIntoJar(session);
      if (moved <= 0) return hud.toast('Your jar is full. Pan some of it down first (J).');
      hud.toast(
        crew.bucket.blackSand > 0
          ? "You wash what fits of the crew's concentrate into your jar. Pan it down to make room for the rest."
          : "You wash the crew's concentrate into your jar. Pan it to see what the sluice caught.",
      );
    },
    panConcentrate: () => {
      if (!session.canPanConcentrate || mode === 'creek') return;
      if (!canPanHere()) return hud.toast(NO_PAN_WATER);
      session.startConcentratePan();
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

  const input = new PanInput(
    app.canvas,
    (x, y) => {
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
  if (pan && pan.phase !== 'emptied') setMode('pan');
  else if (screen === 'town') {
    region.restockOffers(session.pansWorked);
    setMode('town');
  }
  else if (screen === 'region') setMode('region');
  else if (screen === 'sluice' && sluiceHere()) setMode('sluice');
  else if (screen === 'classifier' && spot && classifierHere()) setMode('classifier');
  else if (screen === 'rocker' && spot && rockerHere()) setMode('rocker');
  else if ((screen === 'bank' || screen === 'pan' || screen === 'sluice' || screen === 'classifier' || screen === 'rocker') && spot) setMode('bank');
  else setMode('creek');
  // Nothing is held up on the magnet between visits.
  if (session.clump.sand > 0 || session.clump.gold.length > 0) session.dropClump();
  if (loaded) hud.toast(`Welcome back. ${session.vialMg.toFixed(1)} mg in the vial.`);

  let saveBlocked = false;
  let warnedStorage = false;
  const save = (): void => {
    if (saveBlocked) return;
    const ok = writeSave(createSave(region, session, { screen: mode === 'magnet' ? magnetReturn : mode, creekId: creek.id, spotId: spot?.id ?? null }, Date.now(), { economy, crew }));
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
      __game: { session, region, economy, crew, passTime, get creek() { return creek; }, get mode() { return mode; }, pickSpot: (id: number) => pickSpot(creek.spot(id)), creekMap, regionMap, panView, classifierView },
    });
  }

  const sluiceCoach = new SluiceCoach((message) => hud.toast(message));
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
  /** Said once per fill: sifting into a full bucket does nothing, and tipping off would lose the load. */
  let toldBucketFull = false;
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const controls = input.sample(dt);

    // Game time runs while the player is out working and has touched something lately; not in
    // town or on the map (those are paid for as travel), and not while the game sits idle.
    if (!inTown() && mode !== 'region' && performance.now() - lastInput < IDLE_AFTER_MS) passTime(dt);
    const place = session.sluicePlace;
    creekMap.setStatus(claimBlock() ? (economy.claim(creek.id)?.status === 'released' ? 'claim released' : 'claim lapsed: pay fees in town') : null);
    regionMap.setClaimStatus((c) => (economy.claim(c.id)?.status === 'released' ? 'released' : economy.canWork(c.id) ? 'held' : 'lapsed'));
    bankView.setCrewBucket(place && spot && place.creekId === creek.id && place.spotId === spot.id ? crew.bucket.blackSand : 0);

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
      sluiceView.update(dt, sluice, stepped, sluiceFlow);
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
      cleaningOut,
      classifier,
      rocker,
      fetchingWater: fetchingWater !== null,
      canPan: canPanHere(),
      economy,
      crew,
      restricted: restricted(),
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
