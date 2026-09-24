import { describe, expect, it } from 'vitest';
import { Pan, totalMg, type GoldPiece, type PanControls } from './pan';
import { PanningSession, CONCENTRATE_POUR } from './panningSession';
import { createRng } from './rng';

const DT = 1 / 30;
type Policy = (pan: Pan) => PanControls;

/** Gentle: settle, then a light touch well inside the narrow concentrate limit. */
const gentle: Policy = (pan) => (pan.stratification < 0.6 ? { tilt: 0, swirl: 0, shake: 1 } : { tilt: 0.3, swirl: 0.5, shake: 0 });
/** The skilled gravel technique, which is too rough for concentrate. */
const gravelTechnique: Policy = (pan) =>
  pan.stratification < 0.5 ? { tilt: 0, swirl: 0, shake: 1 } : { tilt: 0.45, swirl: 0.7, shake: 0 };

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
    expect(gravel.classify(0.35)).toBe('balanced');
    expect(conc.classify(0.35)).toBe('aggressive');
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

  it('loses gold gradually, not all at once, when swirled past worked down', () => {
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

  it('refuses to pour while the pan is in use or the jar is empty', () => {
    const empty = new PanningSession(createRng(8));
    expect(empty.canPanConcentrate).toBe(false);
    const busy = sessionWithJar(0.2, []);
    busy.startPan({ richness: 1, clayiness: 0, rockiness: 0 });
    expect(busy.canPanConcentrate).toBe(false);
  });
});
