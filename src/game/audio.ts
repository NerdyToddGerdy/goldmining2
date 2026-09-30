/**
 * The game's sounds, made on the fly with the Web Audio API, apart from the pan's slosh, which is
 * a recorded clip (public/sounds/slosh.wav) with the synthesized swish standing in until it has
 * loaded, or if it can't be. One-shots (a shovel's crunch, a picker's ring, a coin's clink) fire and forget; beds (the pan's
 * slosh, the sluice's rush, whitewater churning) are noise through a filter whose level the game
 * sets every frame, eased so they swell and fade instead of clicking on and off.
 *
 * Browsers only allow audio after a user gesture: nothing plays until `unlock()` is called from
 * one (the start overlay's click). Playback never blocks the game loop; if audio isn't available,
 * every call quietly does nothing.
 */

export type OneShot = 'slosh' | 'crunch' | 'thud' | 'bedrock' | 'pry' | 'rake' | 'chink' | 'ring' | 'clink' | 'thump' | 'drip';
export type Bed = 'slosh' | 'creek' | 'churn';

const MUTE_KEY = 'goldmining2.muted';

interface BedNodes {
  readonly gain: GainNode;
  level: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** The recorded slosh, once fetched and decoded. */
  private sloshClip: AudioBuffer | null = null;
  private readonly beds = new Map<Bed, BedNodes>();
  private muted_ = false;
  /** The last time each one-shot played, so a burst of the same sound doesn't stack into a roar. */
  private readonly lastPlayed = new Map<OneShot, number>();

  constructor() {
    try {
      this.muted_ = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Storage blocked (private mode, an iframe): sound starts on.
    }
  }

  get muted(): boolean {
    return this.muted_;
  }

  set muted(value: boolean) {
    this.muted_ = value;
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
      // Not remembered, but still applied.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(value ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  /** Call from a user gesture: creates (or resumes) the audio context. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted_ ? 0 : 0.7;
        this.master.connect(this.ctx.destination);
        this.noise = this.makeNoise(this.ctx);
        this.makeBed('slosh', 'lowpass', 650, 0.7);
        this.makeBed('creek', 'bandpass', 520, 0.45);
        this.makeBed('churn', 'highpass', 1400, 0.3);
        this.loadClip();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  /** Set how loud a bed is, 0 silent .. 1 full: eased, so calling every frame is fine. */
  bed(which: Bed, level: number): void {
    const b = this.beds.get(which);
    if (!b || !this.ctx) return;
    const target = Math.max(0, Math.min(1, level));
    if (Math.abs(target - b.level) < 0.01) return;
    b.level = target;
    b.gain.gain.setTargetAtTime(target * BED_VOLUME[which], this.ctx.currentTime, 0.12);
  }

  /** Every bed to silence: leaving a screen. */
  quiet(): void {
    for (const which of this.beds.keys()) this.bed(which, 0);
  }

  /** Fire a one-shot. `volume` scales it, 0..1 (a gentle stroke sloshes softer than a hard one). */
  play(which: OneShot, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted_ || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(which) ?? -1) < MIN_GAP[which]) return;
    this.lastPlayed.set(which, now);
    const v = Math.max(0, Math.min(1, volume));
    switch (which) {
      case 'slosh':
        this.slosh(now, v);
        break;
      case 'crunch':
        // Gravel on steel: a gritty burst with a few stones clicking in it.
        this.noiseBurst(now, 0.14, 'bandpass', 1900, 1.1, 0.5);
        for (let i = 0; i < 3; i++) this.tone(now + 0.02 + Math.random() * 0.08, 0.02, 2600 + Math.random() * 1500, 'square', 0.04);
        break;
      case 'thud':
        this.sweep(now, 0.22, 110, 50, 'sine', 0.55);
        this.noiseBurst(now, 0.1, 'lowpass', 400, 0.7, 0.3);
        break;
      case 'bedrock':
        // The shovel hits rock: a dull thud, then the blade rings.
        this.sweep(now, 0.18, 120, 60, 'sine', 0.5);
        this.tone(now + 0.03, 0.5, 1320, 'triangle', 0.08);
        this.tone(now + 0.03, 0.4, 1980, 'sine', 0.04);
        break;
      case 'pry':
        this.noiseSweep(now, 0.35, 700, 1500, 0.35);
        this.sweep(now + 0.3, 0.25, 90, 45, 'sine', 0.5);
        break;
      case 'rake':
        this.noiseSweep(now, 0.3, 1200, 2200, 0.25);
        break;
      case 'chink':
        this.tone(now, 0.12, 3400, 'sine', 0.06);
        break;
      case 'ring':
        // A picker in the pan: a clear, bright ring that hangs.
        this.tone(now, 1.3, 1760, 'triangle', 0.16);
        this.tone(now, 1.0, 2637, 'sine', 0.07);
        this.tone(now, 0.7, 3520, 'sine', 0.04);
        break;
      case 'clink':
        this.tone(now, 0.18, 2100, 'triangle', 0.12);
        this.tone(now + 0.07, 0.22, 3150, 'triangle', 0.1);
        break;
      case 'thump':
        // A heavy wet mat lifted: a low, soggy thump.
        this.noiseBurst(now, 0.25, 'lowpass', 280, 0.8, 0.7);
        this.sweep(now, 0.25, 80, 45, 'sine', 0.45);
        break;
      case 'drip':
        this.sweep(now, 0.07, 1400, 650, 'sine', 0.08);
        break;
    }
  }

  /**
   * One stroke of the shake: a swish, water rushing across the pan and back. Airy noise that
   * swells in and falls away (no hard attack), through a band that rises as the water rushes and
   * drops as it settles. Played on every stroke, each way, it makes the rhythm: swish, swish, swish.
   * Each varies a little, so a shake never sounds looped.
   */
  /** Fetch and decode the recorded slosh. Relative to the page, so it works under any subpath. */
  private loadClip(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    fetch('./sounds/slosh.wav')
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        this.sloshClip = buffer;
      })
      .catch(() => {
        // Keep the synthesized swish.
      });
  }

  /** One stroke of the pan: the recorded slosh, a touch higher or lower each time so it never sounds looped. */
  private slosh(at: number, v: number): void {
    const clip = this.sloshClip;
    if (!clip) return this.swish(at, v);
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = clip;
    source.playbackRate.value = 0.9 + Math.random() * 0.22;
    const gain = ctx.createGain();
    gain.gain.value = 0.95 * v;
    source.connect(gain).connect(this.master!);
    source.start(at);
  }

  private swish(at: number, v: number): void {
    const ctx = this.ctx!;
    const len = 0.13 + Math.random() * 0.03;
    const pitch = 0.9 + Math.random() * 0.2;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.1;
    band.frequency.setValueAtTime(700 * pitch, at);
    band.frequency.exponentialRampToValueAtTime(2000 * pitch, at + len * 0.55);
    band.frequency.exponentialRampToValueAtTime(1100 * pitch, at + len);
    // Take the hiss off the top so it reads as water, not air.
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 3500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.8 * v, at + len * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    source.connect(band).connect(soften).connect(gain).connect(this.master!);
    source.start(at, Math.random() * 1.5);
    source.stop(at + len + 0.03);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private makeBed(which: Bed, type: BiquadFilterType, frequency: number, q: number): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master!);
    // Start each bed at a different point in the noise so they don't phase together.
    source.start(0, Math.random() * 2);
    this.beds.set(which, { gain, level: 0 });
  }

  private envelope(at: number, length: number, peak: number): GainNode {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.01, length / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    gain.connect(this.master!);
    return gain;
  }

  private tone(at: number, length: number, frequency: number, type: OscillatorType, peak: number): void {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(this.envelope(at, length, peak));
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  private sweep(at: number, length: number, from: number, to: number, type: OscillatorType, peak: number): void {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + length);
    osc.connect(this.envelope(at, length, peak));
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  private noiseBurst(at: number, length: number, type: BiquadFilterType, frequency: number, q: number, peak: number): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    source.connect(filter).connect(this.envelope(at, length, peak));
    source.start(at, Math.random() * 1.5);
    source.stop(at + length + 0.05);
  }

  private noiseSweep(at: number, length: number, from: number, to: number, peak: number): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.linearRampToValueAtTime(to, at + length);
    source.connect(filter).connect(this.envelope(at, length, peak));
    source.start(at, Math.random() * 1.5);
    source.stop(at + length + 0.05);
  }
}

/** How loud each bed is at full level, relative to the one-shots. */
const BED_VOLUME: Record<Bed, number> = { slosh: 0.35, creek: 0.22, churn: 0.2 };

/** Seconds before the same one-shot can play again. */
const MIN_GAP: Record<OneShot, number> = {
  slosh: 0.1,
  crunch: 0.08,
  thud: 0.1,
  bedrock: 0.1,
  pry: 0.3,
  rake: 0.2,
  chink: 0.06,
  ring: 0.3,
  clink: 0.15,
  thump: 0.2,
  drip: 0.09,
};
