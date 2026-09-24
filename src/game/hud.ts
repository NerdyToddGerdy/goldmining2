import {
  JAR_CAPACITY,
  quoteSale,
  type DigSpot,
  type GoldPiece,
  type Creek,
  type PanControls,
  type PanStepEvents,
  type PanningSession,
  type Lead,
  type LeadSource,
  type Region,
} from '../sim';
import { forInput, usingTouch } from './inputMode';

export type Mode = 'creek' | 'bank' | 'pan' | 'town' | 'region';

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
  shovel(into: 'pan' | 'spoil'): void;
  pry(): void;
  bail(): void;
  walkCreek(): void;
  newCreek(): void;
  walkToTown(): void;
  openRegion(): void;
  // Town
  sell(): void;
  buyLead(leadId: number): void;
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
}

const HINTS: Record<Mode, string> = {
  creek: 'Walk the creek and pick a spot to dig (click, or press its number). Inside bends, bedrock, black sand, moss lines and boulders are good signs, but only the pan tells the truth.',
  bank: 'Drag from the hole to the pan to fill it, or to the spoil pile to toss it aside. Click a boulder to pry it loose; click a flooded hole to bail it.',
  town: 'The buyer weighs your gold and pays spot less a cut. Bigger lots get a better rate; pickers sell as specimens.',
  region: 'Your known creeks and the town. Click a place to walk there. Follow leads from your notebook to find new stretches.',
  pan: 'Drag back and forth to slosh · W/S or wheel to tilt · hold Space to shake · click rocks to rake them out',
};

/** Shorter hints without keys, for touchscreens. */
const TOUCH_HINTS: Record<Mode, string> = {
  creek: 'Tap a spot to read its signs, then tap again to dig. Only the pan tells the truth.',
  bank: 'Drag from the hole to the pan, or to the spoil pile. Tap a boulder to pry it; tap a flooded hole to bail.',
  town: 'The buyer pays spot less a cut. Bigger lots get a better rate.',
  region: 'Tap a place to walk there. Follow leads from your notebook.',
  pan: 'Drag back and forth to slosh · Tilt slider tips the pan · hold Shake · tap rocks to rake them out',
};

const SOURCE_NAMES: Record<LeadSource, string> = {
  colourTrail: 'Colour trail',
  clue: 'Clue',
  rumour: 'Rumour',
  claimRecord: 'Old claim record',
  mapFragment: 'Map fragment',
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
  private readonly cash: HTMLElement;
  private readonly panel: HTMLElement;
  private panelKey = '';
  /** Small screens start with the notebook and claims board folded up. */
  private panelCollapsed = matchMedia('(max-width: 700px), (max-height: 500px)').matches;
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
      <div class="hud-cash"></div>
      <div class="hud-result" hidden></div>
      <div class="hud-inspect" hidden></div>
      <div class="hud-toast" hidden></div>
      <div class="hud-panel" hidden></div>
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
    this.cash = this.root.querySelector('.hud-cash') as HTMLElement;
    this.panel = this.root.querySelector('.hud-panel') as HTMLElement;
    this.panel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('h3')) {
        this.panelCollapsed = !this.panelCollapsed;
        this.panel.classList.toggle('collapsed', this.panelCollapsed);
        return;
      }
      const target = (e.target as HTMLElement).closest('button');
      if (!target) return;
      target.blur();
      const id = Number(target.dataset.lead);
      if (target.dataset.action === 'buy') this.on.buyLead(id);
      if (target.dataset.action === 'follow') this.on.followLead(id);
    });

    this.tilt.addEventListener('input', () => on.setTilt(Number(this.tilt.value)));
    const shake = this.root.querySelector('.hud-shake') as HTMLElement;
    shake.addEventListener('pointerdown', () => on.setShake(true));
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) shake.addEventListener(type, () => on.setShake(false));
    (this.root.querySelector('.hud-inspect-toggle') as HTMLElement).addEventListener('click', () => this.toggleInspect());
    window.addEventListener('keydown', (e) => this.handleKey(e.key.toLowerCase()));
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

    const hint = usingTouch() ? TOUCH_HINTS[mode] : HINTS[mode];
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    const cash = `$${session.cash.toFixed(2)}`;
    if (this.cash.textContent !== cash) this.cash.textContent = cash;
    this.panControls.hidden = mode !== 'pan';
    if (mode === 'pan' && document.activeElement !== this.tilt) this.tilt.value = String(controls.tilt);

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
    if (mode === 'town') {
      const offer = quoteSale(session.vial);
      const sell: [string, () => void][] = offer.total > 0 ? [[`Sell the vial for $${offer.total.toFixed(2)} (S)`, () => this.on.sell()]] : [];
      return [...sell, ['Back to the creek (Esc)', () => this.on.walkCreek()]];
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
      ? `${mode}:${this.panelCollapsed}:${session.cash}:${region.leads.map((l) => `${l.id}${l.status}`).join()}:${region.offers.map((o) => o.lead.id).join()}`
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
      this.panel.innerHTML = `<h3>Claims board <span class="count">${region.offers.length}</span></h3>${offers.join('') || '<p>Nothing posted. Check back after more panning.</p>'}<p class="small">New leads go up every few pans. Rumours are cheap and often wrong; maps cost more and rarely lie.</p>`;
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
      else if (key === 't') this.on.walkToTown();
      else if (key === 'm') this.on.openRegion();
    } else if (state.mode === 'region') {
      if (key === 'escape') this.on.walkCreek();
    } else if (state.mode === 'town') {
      if (key === 's') this.on.sell();
      else if (key === 'escape') this.on.walkCreek();
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

function leadHeader(lead: Lead): string {
  const { low, high } = lead.richness;
  const hint = lead.hint ? `<p class="small">${lead.hint}</p>` : '';
  return `<b>${lead.name}</b> <span class="small">${SOURCE_NAMES[lead.source]}</span><p>${lead.note}</p>${hint}<p class="small">Suggests ${low.toFixed(1)}× to ${high.toFixed(1)}× the Home Creek.</p>`;
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
    // Drop focus so Space (shake) cannot re-trigger the button.
    b.blur();
    onClick();
  });
  return b;
}
