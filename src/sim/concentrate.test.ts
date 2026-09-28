import { describe, expect, it } from 'vitest';
import { Pan, totalMg, type GoldPiece, type PanControls } from './pan';
import { PanningSession, CONCENTRATE_POUR } from './panningSession';
import { createRng } from './rng';

const DT = 1 / 30;
type Policy = (pan: Pan) => PanControls;

/** Gentle: settle, then a light touch well inside the narrow concentrate limit. */
const gentle: Policy = (pan) => (pan.stratification < 0.6 ? { tilt: 0, shake: 1 } : { tilt: 0.15, shake: 1 });
/** A brisk gravel technique, which is too rough for heavy black sand. */
const gravelTechnique: Policy = (pan) =>
  pan.stratification < 0.5 ? { tilt: 0, shake: 1 } : { tilt: 0.5, shake: 1 };

function jarGold(seed: number): GoldPiece[] {
  const rng = createRng(seed);
  return Array.from({ length: 30 }, (_, i) => ({ id: 10_000 + i, size: rng.next() < 0.8 ? 'fine' : 'flake', mg: rng.range(0.02, 0.4) }));
}

function recovery(policy: Policy, blackSand = 0.25): number {
  let kept = 0;
  let poured = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const gold = jarGold(seed);
    const pan = new Pan(createRng(seed), { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand, gold });
    poured += totalMg(gold);
    for (let t = 0; t < 300 && !pan.workedDown; t += DT) pan.step(DT, policy(pan));
    pan.reveal();
    kept += totalMg(pan.visible);
  }
  return kept / poured;
}

describe('concentrate pan', () => {
  it('holds only black sand and the poured gold', () => {
    const gold = jarGold(1);
    const pan = new Pan(createRng(1), { richness: 5, clayiness: 1, rockiness: 1 }, { blackSand: 0.2, gold });
    expect(pan.kind).toBe('concentrate');
    expect(pan.rocks).toHaveLength(0);
    expect(pan.clay).toBe(0);
    expect(totalMg(pan.gold)).toBeCloseTo(totalMg(gold));
  });

  it('has a narrower safe zone than a gravel pan', () => {
    const gravel = new Pan(createRng(2), { richness: 1, clayiness: 0, rockiness: 0 });
    const conc = new Pan(createRng(2), { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: 0.2, gold: [] });
    gravel.stratification = conc.stratification = 0.9;
    expect(gravel.classify(0.45)).toBe('balanced');
    expect(conc.classify(0.45)).toBe('aggressive');
  });

  it('rewards a light touch: gentle recovers most, gravel technique loses much more', () => {
    const soft = recovery(gentle);
    const rough = recovery(gravelTechnique);
    expect(soft).toBeGreaterThan(0.75);
    expect(rough).toBeLessThan(soft - 0.2);
  });

  it('works for small pours too, not just a full pan-load', () => {
    for (const amount of [0.02, 0.05, 0.1]) expect(recovery(gentle, amount)).toBeGreaterThan(0.75);
  });

  it('loses gold gradually, not all at once, when washed past worked down', () => {
    const gold = jarGold(9);
    const pan = new Pan(createRng(9), { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: 0.1, gold });
    for (let t = 0; t < 300 && !pan.workedDown; t += DT) pan.step(DT, gentle(pan));
    const atWorkedDown = pan.gold.length;
    for (let t = 0; t < 5; t += DT) pan.step(DT, gentle(pan));
    expect(pan.gold.length).toBeGreaterThan(atWorkedDown * 0.6);
  });
});

describe('PanningSession concentrate jar', () => {
  function sessionWithJar(blackSand: number, gold: GoldPiece[]): PanningSession {
    const session = new PanningSession(createRng(7));
    session.jar.blackSand = blackSand;
    session.jar.gold.push(...gold);
    return session;
  }

  it('pours at most one pan-load and keeps the rest in the jar', () => {
    const gold = jarGold(3);
    const session = sessionWithJar(0.4, gold);
    const pan = session.startConcentratePan();
    expect(session.jar.blackSand).toBeCloseTo(0.4 - CONCENTRATE_POUR);
    expect(pan.gold.length + session.jar.gold.length).toBe(gold.length);
  });

  it('pours everything when the jar holds less than a pan-load', () => {
    const gold = jarGold(4);
    const session = sessionWithJar(0.1, gold);
    session.startConcentratePan();
    expect(session.jar.blackSand).toBe(0);
    expect(session.jar.gold).toHaveLength(0);
  });

  it('returns saved residue to the jar and does not count as a gravel pan', () => {
    const session = sessionWithJar(0.1, jarGold(5));
    const pan = session.startConcentratePan();
    pan.reveal();
    session.collect(true);
    expect(session.jar.blackSand).toBeGreaterThan(0);
    expect(session.pansWorked).toBe(0);
  });

  it('tips out spent residue from a worked-down jar pan instead of saving it', () => {
    const session = sessionWithJar(0.2, jarGold(10));
    const pan = session.startConcentratePan();
    for (let t = 0; t < 300 && !pan.workedDown; t += DT) pan.step(DT, gentle(pan));
    expect(pan.residueSpent).toBe(true);
    pan.reveal();
    session.collect(true);
    expect(session.jar.blackSand).toBe(0);
    expect(session.canPanConcentrate).toBe(false);
  });

  it('refuses to pour while the pan is in use or the jar is empty', () => {
    const empty = new PanningSession(createRng(8));
    expect(empty.canPanConcentrate).toBe(false);
    const busy = sessionWithJar(0.2, []);
    busy.startPan({ richness: 1, clayiness: 0, rockiness: 0 });
    expect(busy.canPanConcentrate).toBe(false);
  });
});

describe('finishing pan and snuffer bottle', () => {
  /** Work a jar pan with a fixed tip until `done`, then reveal it. */
  function work(seed: number, opts: { finishing?: boolean; tilt: number; done: (pan: Pan) => boolean }): { pan: Pan; poured: number; time: number } {
    const gold = jarGold(seed);
    const pan = new Pan(createRng(seed), { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: 0.25, gold });
    pan.finishing = opts.finishing ?? false;
    let time = 0;
    for (; time < 300 && !opts.done(pan); time += DT) pan.step(DT, pan.stratification < 0.6 ? { tilt: 0, shake: 1 } : { tilt: opts.tilt, shake: 1 });
    pan.reveal();
    return { pan, poured: totalMg(gold), time };
  }

  it('the finishing pan keeps more fines when tipped too far, and takes longer about it', () => {
    let steelLost = 0;
    let finishLost = 0;
    let steelTime = 0;
    let finishTime = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const steel = work(seed, { tilt: 0.3, done: (p) => p.siftedOut });
      const finishing = work(seed, { finishing: true, tilt: 0.3, done: (p) => p.siftedOut });
      steelLost += totalMg(steel.pan.lost) / steel.poured;
      finishLost += totalMg(finishing.pan.lost) / finishing.poured;
      steelTime += steel.time;
      finishTime += finishing.time;
    }
    expect(finishLost).toBeLessThan(steelLost * 0.5);
    expect(finishTime).toBeGreaterThan(steelTime * 1.2);
  });

  it('the finishing pan works down to a thinner tail that hides less at the reveal', () => {
    let steelHidden = 0;
    let finishHidden = 0;
    for (let seed = 1; seed <= 30; seed++) {
      steelHidden += work(seed, { tilt: 0.15, done: (p) => p.workedDown }).pan.hidden.length;
      finishHidden += work(seed, { finishing: true, tilt: 0.15, done: (p) => p.workedDown }).pan.hidden.length;
    }
    expect(finishHidden).toBeLessThan(steelHidden * 0.75);
  });

  /** A pan revealed with sand left in it, so there's a tail with gold hidden along it. */
  function early(seed: number, sandLeft: number): Pan {
    return work(seed, { tilt: 0.15, done: (p) => p.lightSand <= p.initialLightSand * sandLeft }).pan;
  }

  it('the snuffer draws more from a thin tail than a thick one', () => {
    // The same tail, worked thin or left thick: plant the same hidden specks and snuff it once along.
    const drawn = (sandLeft: number): number => {
      let got = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const pan = early(seed, sandLeft);
        pan.hidden = jarGold(seed + 100);
        pan.tailPos = pan.hidden.map((_, i) => (i + 0.5) / pan.hidden.length);
        for (let at = 0.1; at <= 1; at += 0.2) pan.snuff(at);
        got += pan.bottle.gold.length;
      }
      return got;
    };
    expect(drawn(0.05)).toBeGreaterThan(drawn(0.6) * 1.5);
  });

  it('greedy snuffing clouds the bottle; a clear bottle tips into the vial, a cloudy one goes back to the jar', () => {
    const clear = early(3, 0.08);
    clear.snuff(0.1);
    expect(clear.bottleCloudy).toBe(false);
    const clearGold = [...clear.bottle.gold];
    const clearOut = clear.collect(true);
    for (const piece of clearGold) expect(clearOut.collected).toContain(piece);

    const greedy = early(4, 0.5);
    const total = totalMg([...greedy.visible, ...greedy.hidden]);
    for (let i = 0; i < 6; i++) greedy.snuff(0.2);
    expect(greedy.bottleCloudy).toBe(true);
    const bottled = [...greedy.bottle.gold];
    const out = greedy.collect(true);
    for (const piece of bottled) expect(out.toJar).toContain(piece);
    // Nothing is made or destroyed by the bottle: every piece is in the vial, the jar or lost.
    expect(totalMg([...out.collected, ...out.toJar, ...greedy.lost.filter((p) => bottled.includes(p))])).toBeCloseTo(total);
  });

  it('never tells how much is left in the tail, and keeps the bottle through a save', () => {
    const pan = early(5, 0.3);
    pan.snuff(0.3);
    const restored = Pan.restore(createRng(9), JSON.parse(JSON.stringify(pan.snapshot())));
    expect(restored.bottle.sand).toBeCloseTo(pan.bottle.sand);
    expect(restored.bottle.gold).toEqual(pan.bottle.gold);
    expect(restored.tailPos).toEqual(pan.tailPos);
    expect(restored.finishing).toBe(pan.finishing);
  });

  it('needs the gear: no snuffing without the bottle, no finishing pan without owning one', () => {
    const session = new PanningSession(createRng(6));
    session.jar.blackSand = 0.2;
    session.jar.gold.push(...jarGold(6));
    const pan = session.startConcentratePan(0, true);
    expect(pan.finishing).toBe(false);
    pan.reveal();
    expect(session.snuff(0.2)).toBe(0);
    expect(pan.bottle.sand).toBe(0);
  });
});
