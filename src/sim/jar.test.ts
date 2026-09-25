import { describe, expect, it } from 'vitest';
import { buyGear, OUTFITTER } from './outfitter';
import { totalMg, type GoldPiece } from './pan';
import { BIG_JAR_MULTIPLE, JAR_CAPACITY, PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import { Sluice } from './sluice';

const DT = 1 / 30;
const LOAD = { richness: 5, clayiness: 0, rockiness: 0 };
const piece = (id: number): GoldPiece => ({ id, size: 'fine', mg: 0.05 });

/** A pan worked down and revealed, ready to collect. */
function revealedPan(session: PanningSession): void {
  const pan = session.startPan(LOAD);
  for (let t = 0; t < 300 && !pan.workedDown; t += DT) pan.step(DT, pan.stratification < 0.5 ? { tilt: 0, shake: 1 } : { tilt: 0.4, shake: 1 });
  pan.reveal();
}

describe('the concentrate jar', () => {
  it('holds a fixed amount, and three times that once the big jar is bought for $10', () => {
    const session = new PanningSession(createRng(1));
    expect(session.jarCapacity).toBe(JAR_CAPACITY);
    const bigJar = OUTFITTER.find((g) => g.id === 'bigJar')!;
    expect(bigJar.price).toBe(10);
    session.cash = 10;
    expect(buyGear(session, 'bigJar')).toBe('bought');
    expect(session.jarCapacity).toBeCloseTo(JAR_CAPACITY * BIG_JAR_MULTIPLE);
    expect(BIG_JAR_MULTIPLE).toBe(3);
  });

  it('refuses black sand that will not fit, and loses nothing doing so', () => {
    const session = new PanningSession(createRng(2));
    session.jar.blackSand = session.jarCapacity - 0.001;
    revealedPan(session);
    const visible = session.pan!.visible.length;
    expect(session.canSaveBlackSand).toBe(false);
    expect(session.collect(true)).toBeNull();
    expect(session.pan!.phase).toBe('revealed');
    // Dumping still works, and the visible gold still goes in the vial.
    expect(session.collect(false)).toHaveLength(visible);
  });

  it('saves black sand while there is room', () => {
    const session = new PanningSession(createRng(3));
    revealedPan(session);
    expect(session.canSaveBlackSand).toBe(true);
    const sand = session.pan!.blackSand;
    session.collect(true);
    expect(session.jar.blackSand).toBeCloseTo(sand);
  });

  it('waits to take a sluice mat it has no room for', () => {
    const session = new PanningSession(createRng(4));
    const sluice = new Sluice(createRng(4), { slope: 0.6, flow: 0.9 });
    for (let i = 0; i < 8; i++) {
      sluice.feed(LOAD);
      for (let t = 0; t < 2.5; t += DT) sluice.step(DT, { flow: 0.75 });
    }
    session.jar.blackSand = session.jarCapacity - sluice.matVolume / 2;
    session.jar.gold.push(piece(1));
    expect(session.fitsInJar(sluice.matVolume)).toBe(false);
    expect(session.addConcentrate({ blackSand: sluice.matVolume, gold: [piece(2)] })).toBe(false);
    expect(session.jar.gold).toHaveLength(1);
    // Pan the jar down, then it fits.
    while (session.canPanConcentrate && !session.fitsInJar(sluice.matVolume)) {
      const pan = session.startConcentratePan();
      pan.reveal();
      session.collect(false);
    }
    expect(session.addConcentrate(sluice.liftMat())).toBe(true);
  });

  it('always has room in an empty standard jar for the heaviest possible sluice mat', () => {
    const sluice = new Sluice(createRng(9), { slope: 0.4, flow: 0.7 });
    // Overfeed a weak sluice for a long time without cleaning out.
    for (let i = 0; i < 60; i++) {
      sluice.feed({ richness: 3, clayiness: 0.2, rockiness: 0 });
      for (let t = 0; t < 2; t += DT) sluice.step(DT, { flow: 1 });
      if (sluice.jammed) while (sluice.clog > 0.3) sluice.rake();
    }
    expect(sluice.matVolume).toBeLessThanOrEqual(JAR_CAPACITY);
  });

  it('keeps a sluice set up rather than lose its moss to a full jar', () => {
    const region = new Region(createRng(5));
    let bend = null;
    for (let i = 0; i < 300 && !bend; i++) {
      const r = region.follow(region.clueFound().id);
      if (r.found && r.creek.sluiceSpots.length) bend = r.creek;
    }
    const session = new PanningSession(createRng(5));
    session.cash = 40;
    buyGear(session, 'sluice');
    const site = bend!.sluiceSpots[0]!;
    session.setUpSluice(bend!.id, site);
    const sluice = session.sluiceAt(bend!.id, site.id)!;
    for (let i = 0; i < 6; i++) {
      sluice.feed(LOAD);
      for (let t = 0; t < 2.5; t += DT) sluice.step(DT, { flow: 0.75 });
    }
    const caught = totalMg((sluice as unknown as { moss: { gold: GoldPiece[] } }).moss.gold);
    session.jar.blackSand = session.jarCapacity;
    expect(session.takeDownSluice()).toBe('jarFull');
    expect(session.sluicePlace).not.toBeNull();
    expect(totalMg((sluice as unknown as { moss: { gold: GoldPiece[] } }).moss.gold)).toBeCloseTo(caught);
  });

  it('carries the big jar through a save, and starts without one from a version 5 save', () => {
    const rng = createRng(6);
    const region = new Region(rng);
    const session = new PanningSession(rng);
    session.acquire('bigJar');
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: region.home.id, spotId: null }, 0)));
    expect(loadSave(save, createRng(7))!.session.owns('bigJar')).toBe(true);
    delete save.session.gear;
    const old = loadSave({ ...save, version: 5 }, createRng(8))!;
    expect(old).not.toBeNull();
    expect(old.session.owns('bigJar')).toBe(false);
    expect(old.session.jarCapacity).toBe(JAR_CAPACITY);
  });
});
