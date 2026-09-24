import {
  JAR_CAPACITY,
  type DigSpot,
  type GoldPiece,
  type HomeCreek,
  type PanControls,
  type PanStepEvents,
  type PanningSession,
} from '../sim';

export type Mode = 'creek' | 'bank' | 'pan';

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
  // Bank
  shovel(into: 'pan' | 'spoil'): void;
  pry(): void;
  bail(): void;
  walkCreek(): void;
  newCreek(): void;
}

export interface HudState {
  readonly mode: Mode;
  readonly session: PanningSession;
  readonly creek: HomeCreek;
  readonly spot: DigSpot | null;
  readonly controls: PanControls;
  readonly events: PanStepEvents | null;
}

const HINTS: Record<Mode, string> = {
  creek: 'Walk the creek and pick a spot to dig (click, or press its number). Inside bends, bedrock, black sand, moss lines and boulders are good signs, but only the pan tells the truth.',
  bank: 'Drag from the hole to the pan to fill it, or to the spoil pile to toss it aside. Click a boulder to pry it loose; click a flooded hole to bail it.',
  pan: 'Drag in circles to swirl · W/S or wheel to tilt · hold Space to shake · click rocks to rake them out',
};

const LAYER_NAMES = { overburden: 'topsoil', gravel: 'gravel', payStreak: 'pay streak', bedrock: 'bedrock cracks' } as const;

/**
 * DOM controls around the canvas. Buttons and hints change with the mode; the tilt slider and
 * shake button (for touch) only show while panning. The inspection panel is off by default.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly panControls: HTMLElement;
  private readonly tilt: HTMLInputElement;
  private readonly actions: HTMLElement;
  private readonly result: HTMLElement;
  private readonly inspect: HTMLElement;
  private readonly toastEl: HTMLElement;
  private buttonsKey = '';
  private resultKey = '';
  private inspectOpen = false;
  private lossRate = 0;
  private toastTimer = 0;
  private state: HudState | null = null;

  constructor(private readonly on: HudActions) {
    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="hud-hint"></div>
      <div class="hud-result" hidden></div>
      <div class="hud-inspect" hidden></div>
      <div class="hud-toast" hidden></div>
      <div class="hud-bar">
        <span class="hud-pan-controls">
          <label class="hud-tilt">Tilt <input type="range" min="0" max="1" step="0.01" value="0" /></label>
          <button type="button" class="hud-shake">Shake</button>
        </span>
        <span class="hud-actions"></span>
        <button type="button" class="hud-inspect-toggle" title="Inspection panel (I)">Inspect</button>
      </div>`;
    document.body.appendChild(this.root);

    this.hint = this.root.querySelector('.hud-hint') as HTMLElement;
    this.panControls = this.root.querySelector('.hud-pan-controls') as HTMLElement;
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
    window.addEventListener('keydown', (e) => this.handleKey(e.key.toLowerCase()));
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    // Longer messages stay up longer.
    this.toastTimer = Math.max(3, message.length / 18);
  }

  update(dt: number, state: HudState): void {
    this.state = state;
    const { mode, session, controls, events } = state;
    const pan = session.pan;

    this.hint.textContent = HINTS[mode];
    this.panControls.hidden = mode !== 'pan';
    if (mode === 'pan' && document.activeElement !== this.tilt) this.tilt.value = String(controls.tilt);

    const buttons = this.buttonsFor(state);
    const key = buttons.map(([label]) => label).join('|');
    if (key !== this.buttonsKey) {
      this.buttonsKey = key;
      this.actions.replaceChildren(...buttons.map(([label, action]) => button(label, action)));
    }

    const resultKey = mode === 'pan' && pan ? `${pan.phase}:${pan.kind}:${session.pansWorked}:${session.vial.length}` : '';
    if (resultKey !== this.resultKey) {
      this.resultKey = resultKey;
      this.result.hidden = !pan || mode !== 'pan' || pan.phase === 'working';
      if (pan?.phase === 'revealed') {
        const cover = pan.kind === 'concentrate' ? 'black sand' : 'sand';
        this.result.textContent = describeFind(pan.visible, pan.lightSand / pan.initialLightSand, cover);
      }
      if (pan?.phase === 'emptied') {
        const what = pan.kind === 'concentrate' ? 'Concentrate panned.' : `Pan ${session.pansWorked} done.`;
        this.result.textContent = `${what} ${session.vialMg.toFixed(1)} mg in the vial.`;
      }
    }

    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toastEl.hidden = true;

    const spilled = events ? events.darkSpilled / Math.max(dt, 1e-6) : 0;
    this.lossRate += (spilled - this.lossRate) * Math.min(1, dt * 3);
    if (this.inspectOpen) this.renderInspect(state);
  }

  private buttonsFor(state: HudState): [string, () => void][] {
    const { mode, session, creek, spot } = state;
    if (mode === 'pan') {
      const phase = session.pan?.phase;
      if (phase === 'working') return [['Stop & reveal (R)', () => this.on.reveal()]];
      if (phase === 'revealed') {
        return [
          ['Collect, save black sand (C)', () => this.on.collect(true)],
          ['Collect, dump black sand (D)', () => this.on.collect(false)],
        ];
      }
      return [['Back to the hole (N)', () => this.on.backToHole()], ...this.jarButton(session)];
    }
    if (mode === 'bank' && spot) {
      const blocked = creek.blockedBy(spot);
      const list: [string, () => void][] = [];
      if (blocked === null) {
        list.push(['Shovel into pan (P)', () => this.on.shovel('pan')], ['Toss aside (T)', () => this.on.shovel('spoil')]);
      }
      if (blocked === 'boulder') list.push(['Pry boulder (B)', () => this.on.pry()]);
      if (spot.water > 0.2) list.push(['Bail with pan (A)', () => this.on.bail()]);
      list.push(...this.jarButton(session));
      list.push(['Walk the creek (Esc)', () => this.on.walkCreek()]);
      return list;
    }
    return [['Start a new creek', () => this.on.newCreek()]];
  }

  private jarButton(session: PanningSession): [string, () => void][] {
    return session.canPanConcentrate ? [['Pan the concentrate jar (J)', () => this.on.panConcentrate()]] : [];
  }

  private handleKey(key: string): void {
    if (key === 'i') return this.toggleInspect();
    const state = this.state;
    if (!state) return;
    const phase = state.session.pan?.phase;
    if (state.mode === 'creek') {
      const n = Number(key);
      if (Number.isInteger(n) && n >= 1) this.on.pickSpot(n - 1);
    } else if (state.mode === 'pan') {
      if (key === 'r' && phase === 'working') this.on.reveal();
      else if (key === 'c' && phase === 'revealed') this.on.collect(true);
      else if (key === 'd' && phase === 'revealed') this.on.collect(false);
      else if ((key === 'n' || key === 'enter') && phase === 'emptied') this.on.backToHole();
      else if (key === 'j' && phase === 'emptied') this.on.panConcentrate();
    } else if (state.mode === 'bank') {
      if (key === 'p') this.on.shovel('pan');
      else if (key === 't') this.on.shovel('spoil');
      else if (key === 'b') this.on.pry();
      else if (key === 'a') this.on.bail();
      else if (key === 'escape') this.on.walkCreek();
      else if (key === 'j') this.on.panConcentrate();
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
      ['Concentrate jar', `${Math.round(Math.min(1, session.jar.blackSand / JAR_CAPACITY) * 100)}% full`],
    ];
    let rows: [string, string][] = [];
    const pan = session.pan;
    if (mode === 'pan' && pan) {
      const water = pan.turbidity > 0.3 ? 'muddy' : pan.turbidity > 0.08 ? 'cloudy' : 'clear';
      const loss = this.lossRate > 0.004 ? 'heavy' : this.lossRate > 0.0008 ? 'some' : 'low';
      rows = [
        ['Working', pan.phase === 'working' ? (events?.state ?? 'timid') : pan.phase],
        ['Settled', pan.stratification > 0.7 ? 'well' : pan.stratification > 0.4 ? 'partly' : 'mixed'],
        ['Water', water],
        ['Loss over lip', loss],
        ['Sand left', `${Math.round((pan.lightSand / pan.initialLightSand) * 100)}%`],
      ];
    } else if (mode === 'bank' && spot) {
      const layer = creek.currentLayer(spot);
      const dug = spot.layers.reduce((n, l) => n + l.initialLoads - l.loads, 0);
      rows = [
        ['Digging', spot.slumped > 0 ? 'slumped bank' : layer ? LAYER_NAMES[layer.kind] : 'worked out'],
        ['Shovelfuls dug', String(dug)],
        ['Water in hole', spot.water >= 1 ? 'flooded' : spot.water > 0.5 ? 'deep' : spot.water > 0.1 ? 'seeping' : 'dry'],
        ['Spoil pile', `${spot.spoil} shovelfuls`],
      ];
    }
    this.inspect.innerHTML = [...rows, ...common].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }
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
