import { Application } from 'pixi.js';
import { CreekScene } from './game/creekScene';

async function start(): Promise<void> {
  const host = document.getElementById('game');
  if (!host) throw new Error('Missing #game element');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1d2419, antialias: true });
  host.appendChild(app.canvas);

  const scene = new CreekScene(1849);
  app.stage.addChild(scene);
  const layout = (): void => scene.resize(app.screen.width, app.screen.height);
  layout();
  app.renderer.on('resize', layout);
  app.ticker.add((ticker) => scene.update(ticker.deltaMS / 1000));

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
