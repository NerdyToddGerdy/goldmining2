import { JAR_CAPACITY, type GoldPiece, type PanControls, type PanStepEvents, type PanningSession } from '../sim';

export interface HudActions {
  reveal(): void;
  collect(saveBlackSand: boolean): void;
  nextPan(): void;
  setTilt(tilt: number): void;
  setShake(held: boolean): void;
}

/**
 * DOM controls around the canvas: tilt slider and shake button (for touch), phase actions,
 * and the optional inspection panel. The world view stays primary; the panel is off by default.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly tilt: HTMLInputElement;
  private readonly actions: HTMLElement;
  private readonly result: HTMLElement;
  private readonly inspect: HTMLElement;
  private readonly toastEl: HTMLElement;
  private phaseShown = '';
  private inspectOpen = false;
  private lossRate = 0;
  private toastTimer = 0;

  constructor(private readonly on: HudActions) {
    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="hud-hint">Drag in circles to swirl · W/S or wheel to tilt · hold Space to shake · click rocks to rake them out</div>
      <div class="hud-result" hidden></div>
      <div class="hud-inspect" hidden></div>
      <div class="hud-toast" hidden></div>
      <div class="hud-bar">
        <label class="hud-tilt">Tilt <input type="range" min="0" max="1" step="0.01" value="0" /></label>
        <button type="button" class="hud-shake">Shake</button>
        <span class="hud-actions"></span>
        <button type="button" class="hud-inspect-toggle" title="Inspection panel (I)">Inspect</button>
      </div>`;
    document.body.appendChild(this.root);

    this.tilt = this.root.querySelector('input') as HTMLInputElement;
    this.actions = this.root.querySelector('.hud-actions') as HTMLElement;
    this.result = this.root.querySelector('.hud-result') as HTMLElement;
    this.inspect = this.root.querySelector('.hud-inspect') as HTMLElement;
    this.toastEl = this.root.querySelector('.hud-toast') as HTMLElement;

    this.tilt.addEventListener('input', () => on.setTilt(Number(this.tilt.value)));
    const shake = this.root.querySelector('.hud-shake') as HTMLElement;
    shake.addEventListener('pointerdown', () => on.setShake(true));
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) shake.addEventListener(type, () => on.setShake(false));
    (this.root.querySelector('.hud-inspect-toggle') as HTMLElement).addEventListener('click', () => this.toggleInspect());

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'i') this.toggleInspect();
      else if (key === 'r' && this.phaseShown === 'working') on.reveal();
      else if (key === 'c' && this.phaseShown === 'revealed') on.collect(true);
      else if (key === 'd' && this.phaseShown === 'revealed') on.collect(false);
      else if ((key === 'n' || key === 'enter') && this.phaseShown === 'emptied') on.nextPan();
    });
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastTimer = 2.5;
  }

  update(dt: number, session: PanningSession, controls: PanControls, events: PanStepEvents | null): void {
    const pan = session.pan;
    if (document.activeElement !== this.tilt) this.tilt.value = String(controls.tilt);

    if (pan.phase !== this.phaseShown) {
      this.phaseShown = pan.phase;
      this.actions.replaceChildren(...this.buttonsFor(pan.phase));
      this.result.hidden = pan.phase === 'working';
      if (pan.phase === 'revealed') this.result.textContent = describeFind(pan.visible, pan.lightSand / pan.initialLightSand);
      if (pan.phase === 'emptied') this.result.textContent = `Pan ${session.pansWorked} done. ${session.vialMg.toFixed(1)} mg in the vial.`;
    }

    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toastEl.hidden = true;

    const spilled = events ? events.darkSpilled / Math.max(dt, 1e-6) : 0;
    this.lossRate += (spilled - this.lossRate) * Math.min(1, dt * 3);
    if (this.inspectOpen) this.renderInspect(session, events);
  }

  private buttonsFor(phase: string): HTMLElement[] {
    if (phase === 'working') return [button('Stop & reveal (R)', () => this.on.reveal())];
    if (phase === 'revealed') {
      return [
        button('Collect, save black sand (C)', () => this.on.collect(true)),
        button('Collect, dump black sand (D)', () => this.on.collect(false)),
      ];
    }
    return [button('Scoop next pan (N)', () => this.on.nextPan())];
  }

  private toggleInspect(): void {
    this.inspectOpen = !this.inspectOpen;
    this.inspect.hidden = !this.inspectOpen;
  }

  private renderInspect(session: PanningSession, events: PanStepEvents | null): void {
    const pan = session.pan;
    const water = pan.turbidity > 0.3 ? 'muddy' : pan.turbidity > 0.08 ? 'cloudy' : 'clear';
    const loss = this.lossRate > 0.004 ? 'heavy' : this.lossRate > 0.0008 ? 'some' : 'low';
    const avg = session.pansWorked > 0 ? (session.vialMg / session.pansWorked).toFixed(1) : '–';
    const rows: [string, string][] = [
      ['Working', pan.phase === 'working' ? (events?.state ?? 'timid') : pan.phase],
      ['Settled', pan.stratification > 0.7 ? 'well' : pan.stratification > 0.4 ? 'partly' : 'mixed'],
      ['Water', water],
      ['Loss over lip', loss],
      ['Sand left', `${Math.round((pan.lightSand / pan.initialLightSand) * 100)}%`],
      ['Pans worked', String(session.pansWorked)],
      ['Colour per pan', `${avg} mg`],
      ['Concentrate jar', `${Math.round(Math.min(1, session.jar.blackSand / JAR_CAPACITY) * 100)}% full`],
    ];
    this.inspect.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }
}

function describeFind(pieces: readonly GoldPiece[], sandLeft: number): string {
  const count = (size: GoldPiece['size']): number => pieces.filter((p) => p.size === size).length;
  const pickers = count('picker');
  const flakes = count('flake');
  const specks = count('fine');
  // Sand left in the pan hides gold. Say so rather than implying the pan was empty.
  const covered = sandLeft > 0.25 ? ' Too much sand left to see everything.' : '';
  if (pieces.length === 0) return `No colour showing.${covered}`;
  const parts: string[] = [];
  if (pickers) parts.push(`${pickers} picker${pickers > 1 ? 's' : ''}`);
  if (flakes) parts.push(`${flakes} flake${flakes > 1 ? 's' : ''}`);
  if (specks) parts.push(`${specks} speck${specks > 1 ? 's' : ''}`);
  return `Colour! ${parts.join(', ')}.${covered}`;
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
    // Drop focus so Space (shake) cannot re-trigger the button.
    b.blur();
    onClick();
  });
  return b;
}
