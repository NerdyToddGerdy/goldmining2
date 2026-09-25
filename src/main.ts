import { Application } from 'pixi.js';
import {
  PanningSession,
  Region,
  createRng,
  createSave,
  loadSave,
  buyGear,
  totalMg,
  type Creek,
  type DigSpot,
  type FollowResult,
  type PanStepEvents,
  type ShovelResult,
  type Sluice,
  type SluiceStepEvents,
} from './sim';
import { BankView, type ShovelTarget } from './game/bankView';
import { CreekMapView } from './game/creekMapView';
import { CreekScene } from './game/creekScene';
import { PanCoach, SluiceCoach } from './game/coach';
import { Hud, type Mode } from './game/hud';
import { PanInput } from './game/panInput';
import { PanView } from './game/panView';
import { RegionMapView } from './game/regionMapView';
import { SluiceView } from './game/sluiceView';
import { TownView } from './game/townView';
import { clearSave, readSave, writeSave } from './game/storage';

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
  let creek: Creek = loaded ? region.creek(loaded.place.creekId) : region.home;
  let mode: Mode = 'creek';
  let spot: DigSpot | null = loaded?.place.spotId != null ? creek.spot(loaded.place.spotId) : null;
  /** Topsoil pans in a row; after a few, a one-time tip to dig past it. */
  let topsoilPans = 0;
  let toldAboutTopsoil = false;
  let panLayer: string | null = null;
  /** The sluice: its intake setting, whether a cleanout is under way, and its last step. */
  let sluiceFlow = 0.75;
  let cleaningOut = false;
  let sluiceEvents: SluiceStepEvents | null = null;
  const sluiceHere = (): Sluice | null => (spot ? session.sluiceAt(creek.id, spot.id) : null);
  /** Where the pan's current shovelful came from, for field notes and gully colour. */
  let panSpot: DigSpot | null = session.pan?.kind === 'gravel' && session.pan.phase !== 'emptied' ? spot : null;

  const setMode = (next: Mode): void => {
    mode = next;
    if (mode !== 'creek') creekMap.selected = null;
    regionMap.visible = mode === 'region';
    creekMap.visible = mode === 'creek';
    bankView.visible = mode === 'bank';
    sluiceView.visible = mode === 'sluice';
    townView.visible = mode === 'town';
    scene.visible = panView.visible = mode === 'pan';
    input.enabled = mode === 'pan';
  };

  /** Every new pan starts level, ready to settle, whatever the last pan was left at. */
  const startPanning = (): void => {
    input.tilt = 0;
    setMode('pan');
  };

  const shovel = (into: ShovelTarget): void => {
    if (!spot || mode !== 'bank') return;
    const sluice = into === 'sluice' ? sluiceHere() : null;
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
    if (result.load && sluice) {
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
    creek.recordPan(from.id, totalMg(collected));
    // Topsoil barely pays: after a few pans of it, say once where the gold actually is.
    topsoilPans = panLayer === 'overburden' ? topsoilPans + 1 : 0;
    if (topsoilPans >= 3 && !toldAboutTopsoil) {
      toldAboutTopsoil = true;
      hud.toast('Topsoil rarely pays. Toss it onto the spoil pile to dig down to the gravel: gold settles low, near bedrock.');
    }
    // Colour up a source gully: follow it to where it comes from.
    if (from.gully && collected.length > 0) {
      const traced = region.traceGully(from);
      if (traced?.found) hud.toast(`Colour in the gully! You follow it upstream to ${traced.creek.profile.name}. It is on your region map (M).`);
    }
  };

  const describeFollow = (result: FollowResult): string =>
    result.found
      ? `You find ${result.creek.profile.name}. It is on your region map now.`
      : `You walk out to ${result.lead.name}, but there's nothing there. The ${result.lead.source === 'rumour' ? 'rumour' : 'lead'} was wrong.`;

  const goToCreek = (next: Creek): void => {
    if (next !== creek) spot = null;
    creek = next;
    creekMap.setCreek(next);
    setMode('creek');
  };

  const walkToTown = (): void => {
    region.restockOffers(session.pansWorked);
    setMode('town');
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
  const bankView = new BankView(creek, { shovel, pry, bail, openSluice });
  const sluiceView = new SluiceView({ rake: rakeSluice });
  const scene = new CreekScene();
  const panView = new PanView();
  const townView = new TownView();
  app.stage.addChild(regionMap, creekMap, bankView, sluiceView, townView, scene, panView);

  const layout = (): void => {
    const { width, height } = app.screen;
    regionMap.layout(width, height);
    creekMap.layout(width, height);
    bankView.layout(width, height);
    sluiceView.layout(width, height);
    townView.layout(width, height);
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
    setWater: (flow) => (sluiceFlow = flow),
    setUpSluice: () => {
      if (!spot || mode !== 'bank') return;
      const before = session.sluicePlace;
      const result = session.setUpSluice(creek.id, spot);
      if (result === 'jarFull') {
        hud.toast("Your jar can't hold the sluice's moss, so it can't come down yet. Pan some of the jar first.");
        return;
      }
      if (result !== 'set') return;
      cleaningOut = false;
      const moved = before !== null && (before.creekId !== creek.id || before.spotId !== spot.id);
      hud.toast(
        `${moved ? `You take the sluice down at ${region.creek(before.creekId).profile.name}, wash its moss into your jar, and carry it here. ` : ''}` +
          'The sluice is set in the creek beside this spot. Drag shovelfuls into its header (F), or tap it for a close look.',
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
    walkCreek: () => setMode('creek'),
    walkToTown,
    openRegion: () => setMode('region'),
    buyLead: (leadId) => {
      const lead = region.buy(leadId, session);
      if (lead) hud.toast(`Bought: ${lead.name}. Follow it from your notebook on the region map.`);
      else hud.toast("You can't afford that yet.");
    },
    followLead: (leadId) => hud.toast(describeFollow(region.follow(leadId))),
    buyGear: (id) => {
      const result = buyGear(session, id);
      if (result === 'bought' && id === 'sluice') hud.toast('A hand sluice, riffles and moss and all. It only sets up where a creek has steady water and a drop: look for a creek bend.');
      else if (result === 'bought') hud.toast('A big concentrate jar: three times the room for black sand.');
      else if (result === 'cantAfford') hud.toast("You can't afford that yet.");
    },
    sell: () => {
      if (mode !== 'town' || session.vial.length === 0) return;
      const sale = session.sellVial();
      hud.toast(`Sold for $${sale.total.toFixed(2)}. You have $${session.cash.toFixed(2)}.`);
    },
    newCreek: () => {
      if (!window.confirm('Start over? Your creeks, leads, vial, jar, and cash will all be lost.')) return;
      clearSave();
      saveBlocked = true; // Stop the autosave (and pagehide) from writing this game back before the reload.
      window.location.reload();
    },
    panConcentrate: () => {
      if (!session.canPanConcentrate || mode === 'creek') return;
      session.startConcentratePan();
      startPanning();
      hud.toast('Black sand is heavy and holds fine gold. Settle it, then shake with only a slight tip: a light touch keeps the gold in the pan.');
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
  else if (screen === 'town') walkToTown();
  else if (screen === 'region') setMode('region');
  else if (screen === 'sluice' && sluiceHere()) setMode('sluice');
  else if ((screen === 'bank' || screen === 'pan' || screen === 'sluice') && spot) setMode('bank');
  else setMode('creek');
  if (loaded) hud.toast(`Welcome back. ${session.vialMg.toFixed(1)} mg in the vial.`);

  let saveBlocked = false;
  let warnedStorage = false;
  const save = (): void => {
    if (saveBlocked) return;
    const ok = writeSave(createSave(region, session, { screen: mode, creekId: creek.id, spotId: spot?.id ?? null }, Date.now()));
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
      __game: { session, region, get creek() { return creek; }, get mode() { return mode; }, pickSpot: (id: number) => pickSpot(creek.spot(id)), creekMap, panView },
    });
  }

  const sluiceCoach = new SluiceCoach((message) => hud.toast(message));

  let accumulator = 0;
  let sluiceAccumulator = 0;
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const controls = input.sample(dt);

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
      panView.update(dt, session, controls, events);
    } else if (mode === 'bank') {
      bankView.update(dt);
    } else if (mode === 'sluice' && sluice) {
      sluiceView.update(dt, sluice, stepped, sluiceFlow);
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
