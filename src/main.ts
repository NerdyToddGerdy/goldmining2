import { Application } from 'pixi.js';
import { HomeCreek, PanningSession, createRng, type DigSpot, type PanStepEvents, type ShovelResult } from './sim';
import { BankView } from './game/bankView';
import { CreekMapView } from './game/creekMapView';
import { CreekScene } from './game/creekScene';
import { Hud, type Mode } from './game/hud';
import { PanInput } from './game/panInput';
import { PanView } from './game/panView';

/** Simulation runs on a fixed step so outcomes do not depend on frame rate. */
const SIM_DT = 1 / 60;

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

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1d2419, antialias: true });
  host.appendChild(app.canvas);

  const rng = createRng(Date.now());
  const creek = new HomeCreek(rng);
  const session = new PanningSession(rng);
  let mode: Mode = 'creek';
  let spot: DigSpot | null = null;

  const setMode = (next: Mode): void => {
    mode = next;
    creekMap.visible = mode === 'creek';
    bankView.visible = mode === 'bank';
    scene.visible = panView.visible = mode === 'pan';
    input.enabled = mode === 'pan';
  };

  const shovel = (into: 'pan' | 'spoil'): void => {
    if (!spot || mode !== 'bank') return;
    const highWaterBefore = creek.highWaterEvents;
    const result: ShovelResult = creek.shovel(spot.id, into);
    if (!result.ok) {
      hud.toast(BLOCKED_MESSAGES[result.blocked]);
      return;
    }
    bankView.landed(into, result.from);
    if (result.event) hud.toast(EVENT_MESSAGES[result.event]);
    if (creek.highWaterEvents > highWaterBefore) hud.toast('High water has come through and left fresh gravel along the creek.');
    if (result.load) {
      session.startPan(result.load);
      setMode('pan');
    }
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
    bankView.setSpot(picked);
    setMode('bank');
  };
  const creekMap = new CreekMapView(creek, pickSpot);
  const bankView = new BankView(creek, { shovel, pry, bail });
  const scene = new CreekScene();
  const panView = new PanView();
  app.stage.addChild(creekMap, bankView, scene, panView);

  const layout = (): void => {
    const { width, height } = app.screen;
    creekMap.layout(width, height);
    bankView.layout(width, height);
    scene.resize(width, height);
    panView.layout(width, height, width / 2, scene.waterTop + (height - scene.waterTop) * 0.45);
  };
  layout();
  app.renderer.on('resize', layout);

  const hud = new Hud({
    reveal: () => session.pan?.reveal(),
    collect: (save) => session.collect(save),
    backToHole: () => setMode('bank'),
    setTilt: (tilt) => (input.tilt = tilt),
    setShake: (held) => (input.shakeHeld = held),
    shovel,
    pry,
    bail,
    walkCreek: () => setMode('creek'),
    pickSpot: (index) => {
      const picked = creek.spots[index];
      if (picked) pickSpot(picked);
    },
  });

  const input = new PanInput(
    app.canvas,
    () => panView.center,
    (x, y) => {
      const rockId = panView.rockAt(x, y);
      if (rockId === null) return;
      const picker = session.rakeRock(rockId);
      if (picker) hud.toast(`A picker was wedged in that rock! ${picker.mg.toFixed(1)} mg into the vial.`);
    },
  );
  setMode('creek');

  let accumulator = 0;
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const controls = input.sample(dt);

    let events: PanStepEvents | null = null;
    const pan = session.pan;
    if (mode === 'pan' && pan) {
      accumulator += dt;
      let darkSpilled = 0;
      let lightSpilled = 0;
      let clayRolledOut = 0;
      let glints = 0;
      while (accumulator >= SIM_DT) {
        accumulator -= SIM_DT;
        const e = pan.step(SIM_DT, controls);
        darkSpilled += e.darkSpilled;
        lightSpilled += e.lightSpilled;
        clayRolledOut += e.clayRolledOut;
        glints += e.glints;
        events = { ...e, darkSpilled, lightSpilled, clayRolledOut, glints };
      }
      scene.update(dt);
      panView.update(dt, session, controls, input.swirlDirection, events);
    } else if (mode === 'bank') {
      bankView.update(dt);
    } else {
      creekMap.update(dt);
    }
    hud.update(dt, { mode, session, creek, spot, controls, events });
  });

  // The first click is also the user gesture browsers require before audio can play.
  const overlay = document.getElementById('start');
  overlay?.addEventListener('click', () => overlay.remove(), { once: true });

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
