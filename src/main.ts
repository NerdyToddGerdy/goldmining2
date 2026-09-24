import { Application } from 'pixi.js';
import { PanningSession, createRng, type PanStepEvents } from './sim';
import { CreekScene } from './game/creekScene';
import { Hud } from './game/hud';
import { PanInput } from './game/panInput';
import { PanView } from './game/panView';

/** Simulation runs on a fixed step so outcomes do not depend on frame rate. */
const SIM_DT = 1 / 60;
const HOME_CREEK_SPOT = { richness: 4, clayiness: 0.5, rockiness: 0.5 };

async function start(): Promise<void> {
  const host = document.getElementById('game');
  if (!host) throw new Error('Missing #game element');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1d2419, antialias: true });
  host.appendChild(app.canvas);

  const session = new PanningSession(createRng(Date.now()), HOME_CREEK_SPOT);
  const scene = new CreekScene();
  const panView = new PanView();
  app.stage.addChild(scene, panView);

  const layout = (): void => {
    const { width, height } = app.screen;
    scene.resize(width, height);
    panView.layout(width, height, width / 2, scene.waterTop + (height - scene.waterTop) * 0.45);
  };
  layout();
  app.renderer.on('resize', layout);

  const hud = new Hud({
    reveal: () => session.pan.reveal(),
    collect: (save) => session.collect(save),
    nextPan: () => session.nextPan(),
    setTilt: (tilt) => (input.tilt = tilt),
    setShake: (held) => (input.shakeHeld = held),
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

  let accumulator = 0;
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const controls = input.sample(dt);

    accumulator += dt;
    let events: PanStepEvents | null = null;
    let darkSpilled = 0;
    let lightSpilled = 0;
    let clayRolledOut = 0;
    let glints = 0;
    while (accumulator >= SIM_DT) {
      accumulator -= SIM_DT;
      const e = session.pan.step(SIM_DT, controls);
      darkSpilled += e.darkSpilled;
      lightSpilled += e.lightSpilled;
      clayRolledOut += e.clayRolledOut;
      glints += e.glints;
      events = { ...e, darkSpilled, lightSpilled, clayRolledOut, glints };
    }

    scene.update(dt);
    panView.update(dt, session, controls, input.swirlDirection, events);
    hud.update(dt, session, controls, events);
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
