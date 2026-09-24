import { describe, expect, it } from 'vitest';
import { totalMg, type GoldPiece, type PanLoad } from './pan';
import { PanningSession } from './panningSession';
import { createRng } from './rng';
import { SLUICE_TUNING, Sluice, type SluiceSite } from './sluice';

const DT = 1 / 30;
const LOAD: PanLoad = { richness: 4, clayiness: 0.3, rockiness: 0.5 };
const SITE: SluiceSite = { slope: 0.5, flow: 1 };
const STEEP: SluiceSite = { slope: 1, flow: 1 };

interface Run {
  sluice: Sluice;
  caught: GoldPiece[];
  jams: number;
  seconds: number;
}

/**
 * Feed `loads` shovelfuls at a steady pace, raking any jam, cleaning out (3 s rinse, lift) every
 * `cleanoutEvery` loads and once at the end.
 */
function run(seed: number, opts: { flow: number; interval: number; loads?: number; cleanoutEvery?: number; site?: SluiceSite }): Run {
  const { flow, interval, loads = 24, cleanoutEvery = 8, site = SITE } = opts;
  const sluice = new Sluice(createRng(seed), site);
  const caught: GoldPiece[] = [];
  let jams = 0;
  let fed = 0;
  let sinceClean = 0;
  let t = 0;
  let nextFeed = 0;
  const cleanout = (): void => {
    for (let r = 0; r < 3 / DT; r++) sluice.step(DT, { flow });
    caught.push(...sluice.liftMat().gold);
    sinceClean = 0;
  };
  while ((fed < loads || sluice.headerVolume > 0.01) && t < 2000) {
    if (fed < loads && t >= nextFeed && sluice.feed(LOAD)) {
      fed++;
      sinceClean++;
      nextFeed = t + interval;
    }
    sluice.step(DT, { flow });
    if (sluice.jammed) {
      jams++;
      while (sluice.clog > 0.3) {
        sluice.rake();
        sluice.step(DT, { flow });
      }
    }
    t += DT;
    if (sinceClean >= cleanoutEvery && sluice.headerVolume < 0.01) cleanout();
  }
  cleanout();
  return { sluice, caught, jams, seconds: t };
}

function average(runs: (seed: number) => Run, n = 20) {
  let recovery = 0;
  let jams = 0;
  let secondsPerLoad = 0;
  for (let seed = 1; seed <= n; seed++) {
    const r = runs(seed);
    recovery += totalMg(r.caught) / r.sluice.fedMg;
    jams += r.jams;
    secondsPerLoad += r.seconds / r.sluice.shovelfulsFed;
  }
  return { recovery: recovery / n, jams: jams / n, secondsPerLoad: secondsPerLoad / n };
}

describe('Sluice', () => {
  it('is deterministic for a seed', () => {
    const a = run(3, { flow: 0.75, interval: 2.5 });
    const b = run(3, { flow: 0.75, interval: 2.5 });
    expect(totalMg(a.caught)).toEqual(totalMg(b.caught));
  });

  it('conserves gold: everything fed is in the moss, the header, or the tailings', () => {
    const sluice = new Sluice(createRng(4), SITE);
    for (let i = 0; i < 6; i++) sluice.feed(LOAD);
    for (let t = 0; t < 8; t += DT) sluice.step(DT, { flow: 0.9 });
    const header = (sluice as unknown as { header: { gold: GoldPiece[]; rocks: { stuckPicker: GoldPiece | null }[] } }).header;
    const inHeader = totalMg(header.gold) + totalMg(header.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
    const mat = sluice.liftMat();
    expect(totalMg(mat.gold) + inHeader + totalMg(sluice.lost)).toBeCloseTo(sluice.fedMg);
  });

  it('recovers most of the gold when balanced, and keeps up with brisk shovelling', () => {
    const balanced = average((s) => run(s, { flow: 0.75, interval: 2.5 }));
    expect(balanced.recovery).toBeGreaterThan(0.75);
    expect(balanced.recovery).toBeLessThan(0.9); // Below a skilled pan: fines slip through.
    expect(balanced.jams).toBe(0);
    expect(balanced.secondsPerLoad).toBeLessThan(3);
  });

  it('loses fine gold when overpowered', () => {
    const balanced = average((s) => run(s, { flow: 0.55, interval: 2.5, site: STEEP }));
    const over = average((s) => run(s, { flow: 1, interval: 2, site: STEEP }));
    expect(over.recovery).toBeLessThan(balanced.recovery - 0.15);
  });

  it('jams when underpowered or overfed, and recovers less for it', () => {
    const balanced = average((s) => run(s, { flow: 0.75, interval: 2.5 }));
    const under = average((s) => run(s, { flow: 0.35, interval: 2.5 }));
    const overfed = average((s) => run(s, { flow: 0.75, interval: 1.2 }));
    expect(under.jams).toBeGreaterThan(3);
    expect(overfed.jams).toBeGreaterThan(3);
    expect(under.recovery).toBeLessThan(balanced.recovery - 0.2);
    expect(overfed.recovery).toBeLessThan(balanced.recovery - 0.2);
  });

  it('still recovers well underpowered if fed patiently, just slowly', () => {
    const patient = average((s) => run(s, { flow: 0.35, interval: 5 }));
    expect(patient.recovery).toBeGreaterThan(0.65);
    expect(patient.jams).toBeLessThan(1);
  });

  it('catches less as the moss fills, so late cleanouts cost gold', () => {
    const regular = average((s) => run(s, { flow: 0.75, interval: 2.5, cleanoutEvery: 8 }));
    const late = average((s) => run(s, { flow: 0.75, interval: 2.5, cleanoutEvery: 24 }));
    expect(late.recovery).toBeLessThan(regular.recovery - 0.15);
  });

  it('refuses a shovelful when jammed or brim full', () => {
    const sluice = new Sluice(createRng(5), SITE);
    while (sluice.feed(LOAD));
    expect(sluice.feedBlocked).toBe('full');
    expect(sluice.headerVolume).toBeGreaterThanOrEqual(SLUICE_TUNING.headerMax);
    sluice.clog = 1;
    expect(sluice.feedBlocked).toBe('jammed');
  });

  it('clears a jam with a few rakes, which stirs a little out of the moss', () => {
    const sluice = new Sluice(createRng(6), SITE);
    for (let i = 0; i < 8; i++) {
      sluice.feed(LOAD);
      for (let t = 0; t < 2.5; t += DT) sluice.step(DT, { flow: 0.75 });
    }
    const before = sluice.mossGoldCount;
    const headerBefore = sluice.headerVolume;
    sluice.clog = 1;
    let rakes = 0;
    while (sluice.jammed && rakes < 10) {
      sluice.rake();
      rakes++;
    }
    expect(sluice.jammed).toBe(false);
    expect(rakes).toBeLessThanOrEqual(3);
    expect(sluice.mossGoldCount).toBeLessThanOrEqual(before);
    expect(sluice.headerVolume).toBeLessThanOrEqual(headerBefore);
  });

  it('rinsing too long scours a little; lifting too soon brings more gravel to pan', () => {
    const rinsed = (seconds: number) => {
      const sluice = new Sluice(createRng(7), SITE);
      for (let i = 0; i < 8; i++) {
        sluice.feed(LOAD);
        for (let t = 0; t < 2.5; t += DT) sluice.step(DT, { flow: 0.75 });
      }
      for (let t = 0; t < seconds; t += DT) sluice.step(DT, { flow: 0.75 });
      return sluice.liftMat();
    };
    const short = rinsed(0.3);
    const normal = rinsed(3);
    const long = rinsed(90);
    expect(short.blackSand).toBeGreaterThan(normal.blackSand);
    expect(totalMg(long.gold)).toBeLessThan(totalMg(normal.gold));
    expect(totalMg(long.gold)).toBeGreaterThan(totalMg(normal.gold) * 0.6);
  });

  it('round-trips through a snapshot', () => {
    const a = run(8, { flow: 0.75, interval: 2.5, loads: 5, cleanoutEvery: 99 }).sluice;
    a.feed(LOAD);
    const b = new Sluice(createRng(1), a.site, JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(b.mossLoading).toBeCloseTo(a.mossLoading);
  });
});

describe('cleanout into the concentrate jar', () => {
  it('washes the mat into the jar, ready to pan', () => {
    const r = run(9, { flow: 0.75, interval: 2.5, loads: 8, cleanoutEvery: 99 });
    const session = new PanningSession(createRng(9));
    const mat = { blackSand: 0.3, gold: r.caught };
    session.addConcentrate(mat);
    expect(session.jar.blackSand).toBeCloseTo(0.3);
    expect(totalMg(session.jar.gold)).toBeCloseTo(totalMg(r.caught));
    expect(session.canPanConcentrate).toBe(true);
  });
});
