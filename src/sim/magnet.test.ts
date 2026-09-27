import { describe, expect, it } from 'vitest';
import { MAGNET_TUNING } from './magnet';
import { buyGear } from './outfitter';
import { totalMg, type GoldPiece } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';

let id = 1;
const fines = (n: number): GoldPiece[] => Array.from({ length: n }, () => ({ id: id++, size: 'fine' as const, mg: 0.05 }));

/** A session with the magnet and a full jar of fresh black sand holding 200 specks. */
function withJar(seed: number): PanningSession {
  const session = new PanningSession(createRng(seed));
  session.cash = 10;
  buyGear(session, 'magnet');
  session.addConcentrate({ blackSand: 0.8, gold: fines(200) });
  return session;
}

/** Pass the magnet until most magnetite is gone, dealing with each clump. Returns gold stripped off. */
function clean(session: PanningSession, closeness: number, shake: boolean): { seconds: number; lost: number } {
  let seconds = 0;
  let lost = 0;
  while (session.jarMagnetiteShare > 0.1 && seconds < 600) {
    session.passMagnet(0.1, closeness);
    seconds += 0.1;
    if (session.clump.sand >= MAGNET_TUNING.clumpMax - 1e-9) {
      if (shake) session.shakeClumpBack();
      lost += session.stripClump().length;
    }
  }
  if (shake) session.shakeClumpBack();
  lost += session.stripClump().length;
  return { seconds, lost };
}

describe('the magnet', () => {
  it('does nothing without one', () => {
    const session = new PanningSession(createRng(1));
    session.addConcentrate({ blackSand: 0.5, gold: [] });
    expect(session.passMagnet(1, 1).lifted).toBe(0);
    expect(session.jar.magnetite).toBeCloseTo(0.5 * MAGNET_TUNING.share);
  });

  it('strips magnetite into a clump, freeing jar space, and stops when the sleeve is full', () => {
    const session = withJar(2);
    const space = session.jarSpace;
    for (let t = 0; t < 20; t += 0.1) session.passMagnet(0.1, 1);
    expect(session.clump.sand).toBeCloseTo(MAGNET_TUNING.clumpMax);
    expect(session.jarSpace).toBeCloseTo(space + MAGNET_TUNING.clumpMax);
    session.stripClump();
    expect(session.clump.sand).toBe(0);
  });

  it('can free most of the magnetite share of the jar', () => {
    const session = withJar(3);
    clean(session, 0.6, true);
    expect(session.jar.blackSand).toBeLessThan(0.8 * (1 - MAGNET_TUNING.share * 0.85));
  });

  it('close is quick but costs gold; high is slow and clean; shaking back saves most of it', () => {
    const close = clean(withJar(4), 1, false);
    const closeShaken = clean(withJar(4), 1, true);
    const high = clean(withJar(4), 0.15, false);
    expect(close.seconds).toBeLessThan(high.seconds / 2);
    expect(close.lost).toBeGreaterThan(high.lost * 3);
    expect(closeShaken.lost).toBeLessThan(close.lost * 0.5);
  });

  it('conserves gold: every speck is in the jar, the clump, or stripped off', () => {
    const session = withJar(5);
    const before = totalMg(session.jar.gold);
    let stripped = 0;
    for (let t = 0; t < 30; t += 0.1) {
      session.passMagnet(0.1, 0.8);
      if (session.clump.sand >= MAGNET_TUNING.clumpMax) stripped += totalMg(session.stripClump());
    }
    expect(totalMg(session.jar.gold) + totalMg(session.clump.gold) + stripped).toBeCloseTo(before);
  });

  it('keeps what a jar pour had stripped when unpanned sand goes back', () => {
    const session = withJar(6);
    clean(session, 0.5, true);
    const share = session.jarMagnetiteShare;
    const pan = session.startConcentratePan();
    pan.reveal();
    session.collect(true);
    expect(session.jarMagnetiteShare).toBeCloseTo(share, 5);
  });

  it('keeps the clump through a save, and a version 9 jar comes in as fresh sand', () => {
    const session = withJar(7);
    for (let t = 0; t < 1; t += 0.1) session.passMagnet(0.1, 1);
    const region = new Region(createRng(7));
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'town', creekId: region.home.id, spotId: null }, 0)));
    expect(loadSave(save, createRng(8))!.session.snapshot()).toEqual(session.snapshot());
    delete save.session.clump;
    delete save.session.jar.magnetite;
    const loaded = loadSave({ ...save, version: 9 }, createRng(9))!;
    expect(loaded.session.jar.magnetite).toBeCloseTo(session.jar.blackSand * MAGNET_TUNING.share);
    expect(loaded.session.clump.sand).toBe(0);
  });
});
