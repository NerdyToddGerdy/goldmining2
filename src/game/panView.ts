import { Container, Graphics, Text } from 'pixi.js';
import { JAR_CAPACITY, type GoldPiece, type Pan, type PanControls, type PanStepEvents, type PanningSession } from '../sim';

/**
 * Draws the pan and everything in it. The pan's condition is communicated physically:
 * pale sand sheeting over the lip is healthy, a dark streak means black sand and gold are
 * going with it, muddy water means clay is still unbroken, glints hint at gold.
 */

const LIGHT_GRAINS = 240;
const DARK_GRAINS = 60;
const CLAY_BLOBS = 6;

const COLORS = {
  panRim: 0x4b4944,
  panBody: 0x2c2b29,
  panFloor: 0x363431,
  light: [0xc8b891, 0xb3a37e, 0xd6c9a4, 0x9e906f],
  dark: [0x24211f, 0x302b28, 0x3b3530],
  /** Black sand being washed off a concentrate pan: magnetite with the odd red garnet. */
  concentrate: [0x1c1a19, 0x26221f, 0x2f2a26, 0x5a2e2a],
  /** The finest, heaviest residue left under the gold in a concentrate pan. */
  residue: [0x0f0e0d, 0x171514],
  clay: 0x8a5d3b,
  rock: [0x77746c, 0x8d8a80, 0x6a665e],
  water: 0x4f8a8c,
  mud: 0x7a5a3a,
  gold: 0xe6b940,
  goldBright: 0xfff0a8,
  spray: 0xe8f2f0,
} as const;

interface Grain {
  a: number;
  r: number;
  size: number;
  color: number;
  /** Dark grains sit under the light layer once stratification exceeds this. */
  layer: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

interface Glint {
  x: number;
  y: number;
  life: number;
}

interface RevealedPiece {
  piece: GoldPiece;
  x: number;
  y: number;
  rot: number;
}

export class PanView extends Container {
  private readonly body = new Container();
  private readonly contents = new Graphics();
  private readonly spray = new Graphics();
  private readonly vialGraphics = new Graphics();
  private readonly vialLabel = new Text({ text: '', style: { fill: 0xefe6cf, fontSize: 14, fontFamily: 'Georgia, serif' } });

  private radius = 100;
  private rx = 78;
  private ry = 48;
  private time = 0;
  private shakeOffset = 0;

  private pan: Pan | null = null;
  private light: Grain[] = [];
  private dark: Grain[] = [];
  private clayBlobs: Grain[] = [];
  private rockGrains = new Map<number, Grain>();
  private initialBlackSand = 1;
  private initialClay = 1;
  private particles: Particle[] = [];
  private glints: Glint[] = [];
  private revealed: RevealedPiece[] = [];
  private darkSpillCarry = 0;
  /** Grain count for this pan's washable layer; a jar pour is a small pile. */
  private lightCount = LIGHT_GRAINS;

  constructor() {
    super();
    this.body.addChild(this.contents);
    this.addChild(this.body, this.spray, this.vialGraphics, this.vialLabel);
  }

  get center(): { x: number; y: number } {
    return { x: this.body.x, y: this.body.y };
  }

  layout(width: number, height: number, centerX: number, centerY: number): void {
    this.radius = Math.min(width, height) * 0.32;
    this.rx = this.radius * 0.78;
    this.ry = this.radius * 0.48;
    this.body.position.set(centerX, centerY);
    // Below the HUD's cash readout in the top-right corner.
    this.vialGraphics.position.set(width - 90, 48);
    this.vialLabel.position.set(width - 96, 170);
  }

  setPan(pan: Pan): void {
    this.pan = pan;
    this.initialBlackSand = Math.max(pan.blackSand, 1e-6);
    this.initialClay = Math.max(pan.clay, 1e-6);
    this.revealed = [];
    const concentrate = pan.kind === 'concentrate';
    // A gravel pan starts about 70% washable sand; size a jar pour's pile to match its volume.
    const fullness = Math.min(1, pan.initialLightSand / 0.7);
    this.lightCount = Math.max(20, Math.round(LIGHT_GRAINS * fullness));
    const pileRadius = concentrate ? 0.35 + 0.55 * Math.sqrt(fullness) : 0.9;
    this.light = Array.from({ length: this.lightCount }, () =>
      grain(pileRadius, 1.4, concentrate ? 2.4 : 3.2, pick(concentrate ? COLORS.concentrate : COLORS.light)),
    );
    this.dark = Array.from({ length: DARK_GRAINS }, () =>
      grain(concentrate ? pileRadius * 0.8 : 0.75, 1.2, 2.4, pick(concentrate ? COLORS.residue : COLORS.dark)),
    );
    this.clayBlobs = pan.clay > 0.005 ? Array.from({ length: CLAY_BLOBS }, () => grain(0.7, 7, 12, COLORS.clay)) : [];
    this.rockGrains = new Map(pan.rocks.map((rock) => [rock.id, grain(0.7, 11, 17, pick(COLORS.rock))]));
  }

  /** Rock under a screen point, if any, so it can be raked out. */
  rockAt(screenX: number, screenY: number): number | null {
    const local = this.body.toLocal({ x: screenX, y: screenY });
    for (const [id, g] of this.rockGrains) {
      const p = this.grainPos(g, 0);
      if (Math.hypot(local.x - p.x, local.y - p.y) < g.size * this.scaleFactor + 6) return id;
    }
    return null;
  }

  update(dt: number, session: PanningSession, controls: PanControls, swirlDirection: number, events: PanStepEvents | null): void {
    const pan = session.pan;
    if (!pan) return;
    if (pan !== this.pan) this.setPan(pan);
    this.time += dt;

    // Tip the whole pan toward the lip (right side), and jitter it while shaking.
    this.shakeOffset = controls.shake > 0 && pan.phase === 'working' ? Math.sin(this.time * 45) * 6 : this.shakeOffset * 0.8;
    this.body.rotation = controls.tilt * 0.22;
    this.body.pivot.x = -this.shakeOffset;

    if (pan.phase === 'working') this.animateWorking(dt, pan, controls, swirlDirection, events);
    else if (pan.phase === 'revealed' && this.revealed.length === 0) this.fanOut(pan);

    this.updateParticles(dt);
    this.draw(pan, controls);
    this.drawVial(session);
  }

  private animateWorking(dt: number, pan: Pan, controls: PanControls, dir: number, events: PanStepEvents | null): void {
    const spin = dir * controls.swirl * 2.2;
    for (const g of this.light) g.a += (spin / (0.35 + g.r)) * dt;
    for (const g of this.dark) g.a += ((spin * (1 - pan.stratification * 0.6)) / (0.35 + g.r)) * dt;
    for (const g of this.clayBlobs) g.a += (spin * 0.5 * dt) / (0.35 + g.r);
    for (const g of this.rockGrains.values()) g.a += (spin * 0.25 * dt) / (0.35 + g.r);
    if (controls.shake > 0) {
      for (const g of this.light) g.r = Math.min(0.92, Math.max(0.05, g.r + (Math.random() - 0.5) * 0.02));
    }

    // Grains leave in the order they sit nearest the lip, and fly out over it.
    const lightTarget = Math.round((pan.lightSand / pan.initialLightSand) * this.lightCount);
    while (this.light.length > lightTarget) this.spill(this.removeNearestLip(this.light, controls.tilt));
    const darkTarget = Math.round((pan.blackSand / this.initialBlackSand) * DARK_GRAINS);
    while (this.dark.length > darkTarget) this.spill(this.removeNearestLip(this.dark, controls.tilt));
    // Even a little black-sand loss must be visible: carry fractional grains forward as a dark streak.
    if (events && events.darkSpilled > 0) {
      this.darkSpillCarry += (events.darkSpilled / this.initialBlackSand) * DARK_GRAINS * 4;
      while (this.darkSpillCarry >= 1) {
        this.darkSpillCarry -= 1;
        this.spillAtLip(pick(COLORS.dark), 2);
      }
    }
    const clayTarget = Math.ceil((pan.clay / this.initialClay) * this.clayBlobs.length);
    while (this.clayBlobs.length > clayTarget && pan.clay < this.initialClay) {
      const blob = this.removeNearestLip(this.clayBlobs, controls.tilt);
      if (blob) {
        // Broken clay clouds the water; rolled-out clay leaves over the lip.
        if (events && events.clayRolledOut > 0) this.spill(blob);
      }
    }
    for (const id of [...this.rockGrains.keys()]) if (!pan.rocks.some((r) => r.id === id)) this.rockGrains.delete(id);

    if (events?.state === 'aggressive') {
      const wash = controls.swirl * controls.tilt;
      for (let i = 0; i < Math.ceil(wash * 4); i++) this.spillAtLip(COLORS.spray, 1.5, true);
    }
    // Gold going over the lip flashes as it goes: the clearest sign of washing too hard.
    for (let i = 0; i < (events?.goldLost ?? 0); i++) this.spillAtLip(COLORS.goldBright, 2);
    if (events && events.glints > 0 && this.dark.length > 0) {
      const g = pick(this.dark);
      const p = this.grainPos(g, controls.tilt * 0.08);
      this.glints.push({ x: p.x, y: p.y, life: 0.35 });
    }
    this.glints = this.glints.filter((glint) => (glint.life -= dt) > 0);
  }

  /** On reveal, the concentrate fans out into a crescent tail and the visible gold sits in it. */
  private fanOut(pan: Pan): void {
    for (const g of this.dark) {
      g.a = Math.PI * (0.65 + Math.random() * 0.7);
      g.r = 0.55 + Math.random() * 0.3;
    }
    this.revealed = pan.visible.map((piece) => {
      const a = Math.PI * (0.7 + Math.random() * 0.45);
      const r = 0.6 + Math.random() * 0.22;
      return { piece, x: Math.cos(a) * r * this.rx, y: Math.sin(a) * r * this.ry, rot: Math.random() * Math.PI };
    });
    if (this.revealed.length === 0) this.revealed.push({ piece: { id: -1, size: 'fine', mg: 0 }, x: 0, y: 0, rot: 0 });
  }

  private draw(pan: Pan, controls: PanControls): void {
    const g = this.contents.clear();
    const s = this.scaleFactor;
    const R = this.radius;

    g.ellipse(0, 0, R, R * 0.62).fill(COLORS.panBody).stroke({ width: R * 0.06, color: COLORS.panRim });
    g.ellipse(0, 0, this.rx, this.ry).fill(COLORS.panFloor);

    const lightShift = pan.phase === 'working' ? controls.tilt * 0.28 : 0;
    const darkShift = pan.phase === 'working' ? controls.tilt * 0.08 : 0;
    const settled = pan.stratification;

    if (pan.phase !== 'emptied') {
      for (const d of this.dark) if (d.layer <= settled || pan.phase === 'revealed') this.dot(g, d, darkShift, s);
      for (const l of this.light) this.dot(g, l, lightShift, s);
      if (pan.phase === 'working') for (const d of this.dark) if (d.layer > settled) this.dot(g, d, darkShift, s);
      for (const c of this.clayBlobs) this.dot(g, c, darkShift, s);
      for (const r of this.rockGrains.values()) {
        const p = this.grainPos(r, 0);
        g.circle(p.x, p.y, r.size * s).fill(r.color).stroke({ width: 1.5, color: 0x3c3a35 });
      }
    }

    for (const rp of pan.phase === 'revealed' ? this.revealed : []) {
      if (rp.piece.id < 0) continue;
      const size = (rp.piece.size === 'fine' ? 1.3 : rp.piece.size === 'flake' ? 3 : 6) * s;
      const shimmer = 0.75 + 0.25 * Math.sin(this.time * 5 + rp.piece.id);
      if (rp.piece.size === 'fine') g.circle(rp.x, rp.y, size).fill({ color: COLORS.gold, alpha: shimmer });
      else g.poly(nuggetShape(rp.x, rp.y, size, rp.rot)).fill({ color: COLORS.gold, alpha: shimmer }).stroke({ width: 1, color: COLORS.goldBright, alpha: shimmer * 0.6 });
    }

    // Water film: pools toward the lip as the pan tips; clay and fines turn it brown.
    const murk = Math.min(1, pan.turbidity * 1.5);
    const waterColor = lerpColor(COLORS.water, COLORS.mud, murk);
    g.ellipse(controls.tilt * this.rx * 0.3, 0, this.rx * (1 - controls.tilt * 0.3), this.ry * 0.95)
      .fill({ color: waterColor, alpha: 0.18 + murk * 0.55 });

    for (const glint of this.glints) {
      const a = glint.life / 0.35;
      const k = 7 * s * a;
      g.moveTo(glint.x - k, glint.y).lineTo(glint.x + k, glint.y).moveTo(glint.x, glint.y - k).lineTo(glint.x, glint.y + k)
        .stroke({ width: 1.5, color: COLORS.goldBright, alpha: a });
    }

    const spray = this.spray.clear();
    for (const p of this.particles) spray.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: Math.min(1, p.life / p.maxLife + 0.2) });
  }

  private drawVial(session: PanningSession): void {
    const v = this.vialGraphics.clear();
    const mg = session.vialMg;
    const fill = Math.min(1, mg / 60);
    v.roundRect(0, 0, 26, 110, 10).fill({ color: 0xdfe8e6, alpha: 0.12 }).stroke({ width: 2, color: 0xdfe8e6, alpha: 0.5 });
    if (fill > 0) v.roundRect(3, 107 - 104 * fill, 20, 104 * fill, 8).fill(COLORS.gold);
    v.rect(4, -6, 18, 8).fill(0x6b4f35);

    const jarFill = Math.min(1, session.jar.blackSand / JAR_CAPACITY);
    v.roundRect(-58, 50, 40, 60, 6).fill({ color: 0xdfe8e6, alpha: 0.1 }).stroke({ width: 2, color: 0xdfe8e6, alpha: 0.4 });
    if (jarFill > 0) v.roundRect(-55, 107 - 54 * jarFill, 34, 54 * jarFill, 4).fill(COLORS.dark[1]);

    this.vialLabel.text = `${mg.toFixed(1)} mg`;
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private spill(g: Grain | undefined): void {
    if (g) this.spillAtLip(g.color, g.size * this.scaleFactor * 0.8);
  }

  private spillAtLip(color: number, size: number, isSpray = false): void {
    const lipY = (Math.random() - 0.5) * this.ry * 0.9;
    const lip = this.toLocal(this.body.toGlobal({ x: this.radius * 0.98, y: lipY }));
    const life = isSpray ? 0.35 : 0.7;
    this.particles.push({
      x: lip.x,
      y: lip.y,
      vx: 60 + Math.random() * (isSpray ? 160 : 70),
      vy: isSpray ? -80 - Math.random() * 120 : -10 + Math.random() * 30,
      life,
      maxLife: life,
      size,
      color,
    });
  }

  private removeNearestLip(grains: Grain[], tilt: number): Grain | undefined {
    let best = -1;
    let bestX = -Infinity;
    for (let i = 0; i < grains.length; i++) {
      const g = grains[i];
      if (!g) continue;
      const x = this.grainPos(g, tilt * 0.28).x + Math.random() * this.rx * 0.5;
      if (x > bestX) {
        bestX = x;
        best = i;
      }
    }
    return best >= 0 ? grains.splice(best, 1)[0] : undefined;
  }

  private grainPos(g: Grain, shift: number): { x: number; y: number } {
    return { x: Math.cos(g.a) * g.r * this.rx + shift * this.rx, y: Math.sin(g.a) * g.r * this.ry };
  }

  private dot(g: Graphics, grainToDraw: Grain, shift: number, s: number): void {
    const p = this.grainPos(grainToDraw, shift);
    g.circle(p.x, p.y, grainToDraw.size * s).fill(grainToDraw.color);
  }

  /** Grain sizes are authored for a ~300px pan and scale with it. */
  private get scaleFactor(): number {
    return this.radius / 150;
  }
}

function grain(maxR: number, minSize: number, maxSize: number, color: number): Grain {
  return {
    a: Math.random() * Math.PI * 2,
    r: Math.sqrt(Math.random()) * maxR,
    size: minSize + Math.random() * (maxSize - minSize),
    color,
    layer: Math.random(),
  };
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function nuggetShape(x: number, y: number, size: number, rot: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rot + (i / 7) * Math.PI * 2;
    const r = size * (0.7 + 0.3 * Math.sin(i * 2.7 + rot * 3));
    points.push(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75);
  }
  return points;
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}
