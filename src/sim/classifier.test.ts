import { describe, expect, it } from 'vitest';
import { CLASSIFIER_TUNING, Classifier } from './classifier';
import { buyGear } from './outfitter';
import { PAN_VOLUME, Pan, rollShovelful, totalMg, type GoldPiece, type Shovelful } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng, type Rng } from './rng';
import { createSave, loadSave } from './save';
import { Sluice } from './sluice';

const DT = 1 / 30;
const ROCKY = { richness: 5, clayiness: 0.3, rockiness: 0.8 };

function shovelful(rng: Rng, load = ROCKY): Shovelful {
  return rollShovelful(rng, load);
}

/** Shake until everything passable is through; returns seconds taken. */
function screen(c: Classifier): number {
  let t = 0;
  while (!c.screened && t < 120) {
    c.step(DT, 1);
    t += DT;
  }
  return t;
}

const pickersIn = (s: Shovelful): GoldPiece[] => s.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []));

describe('Classifier', () => {
  it('passes all the gold and fines, and holds the rocks back', () => {
    const rng = createRng(1);
    const c = new Classifier(rng);
    const s = shovelful(rng);
    expect(c.load(s)).toBe('loaded');
    screen(c);
    expect(c.rocks).toHaveLength(s.rocks.length);
    expect(c.bucketGoldCount).toBe(s.gold.length);
    expect(c.bucketVolume).toBeCloseTo(s.lightSand + s.blackSand + s.clay);
  });

  it('holds pebbles back on the fine screen, so less volume reaches the bucket for the same gold', () => {
    const rng = createRng(2);
    const fine = new Classifier(rng);
    fine.setScreen('fine');
    const s = shovelful(rng);
    fine.load(s);
    screen(fine);
    expect(fine.pebbles).toBeCloseTo(s.lightSand * CLASSIFIER_TUNING.pebbleShare);
    expect(fine.bucketVolume).toBeCloseTo(s.lightSand * (1 - CLASSIFIER_TUNING.pebbleShare) + s.blackSand + s.clay);
    expect(fine.bucketGoldCount).toBe(s.gold.length);
  });

  it('shakes through slower on the fine screen, and slower still when rocks blind the mesh', () => {
    const coarseTime = (load: typeof ROCKY) => {
      const rng = createRng(3);
      const c = new Classifier(rng);
      c.load(shovelful(rng, load));
      return screen(c);
    };
    const fineTime = (() => {
      const rng = createRng(3);
      const c = new Classifier(rng);
      c.setScreen('fine');
      c.load(shovelful(rng));
      return screen(c);
    })();
    expect(fineTime).toBeGreaterThan(coarseTime(ROCKY) * 1.5);
    expect(coarseTime(ROCKY)).toBeGreaterThan(coarseTime({ ...ROCKY, rockiness: 0 }));
  });

  it('finds wedged pickers by inspecting rocks; tipping them off unexamined loses them', () => {
    let found = 0;
    let tipped = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      const s = shovelful(rng, { ...ROCKY, rockiness: 1 });
      const inspect = seed % 2 === 0;
      const c = new Classifier(rng);
      c.load(s);
      screen(c);
      if (inspect) for (const rock of [...c.rocks]) found += c.inspectRock(rock.id) ? 1 : 0;
      tipped += c.tipOff().length;
    }
    expect(found).toBeGreaterThan(0);
    expect(tipped).toBeGreaterThan(0);
  });

  it('loses what has not been shaken through if tipped off early', () => {
    const rng = createRng(5);
    const c = new Classifier(rng);
    const s = shovelful(rng);
    c.load(s);
    c.step(DT, 1);
    const lost = c.tipOff();
    expect(totalMg(lost)).toBeGreaterThan(0);
    expect(c.hasLoad).toBe(false);
  });

  it('never creates or destroys gold', () => {
    const rng = createRng(6);
    const c = new Classifier(rng);
    let fed = 0;
    for (let i = 0; i < 3; i++) {
      const s = shovelful(rng);
      fed += totalMg(s.gold) + totalMg(pickersIn(s));
      c.load(s);
      for (let k = 0; k < 20; k++) c.step(DT, 1);
      if (i < 2) {
        screen(c);
        c.tipOff();
      }
    }
    const poured = c.pour(0.5)!;
    expect(totalMg(poured.gold) + c.heldMg + totalMg(c.lost)).toBeCloseTo(fed);
  });

  it('takes one shovelful at a time, swaps screens only when empty, and stops at a full bucket', () => {
    const rng = createRng(7);
    const c = new Classifier(rng);
    expect(c.load(shovelful(rng))).toBe('loaded');
    expect(c.load(shovelful(rng))).toBe('screenBusy');
    expect(c.setScreen('fine')).toBe(false);
    for (let i = 0; i < 6; i++) {
      screen(c);
      c.tipOff();
      if (c.load(shovelful(rng)) === 'bucketFull') break;
    }
    expect(c.bucketFull).toBe(true);
    expect(c.bucketVolume).toBeLessThanOrEqual(CLASSIFIER_TUNING.bucketCapacity + 1e-9);
    expect(c.load(shovelful(rng))).toBe('bucketFull');
    expect(c.setScreen('fine')).toBe(true);
  });

  it('pours a pan-sized share, or all of it with every piece of gold', () => {
    const rng = createRng(8);
    const c = new Classifier(rng);
    for (let i = 0; i < 2; i++) {
      c.load(shovelful(rng));
      screen(c);
      c.tipOff();
    }
    const total = c.bucketVolume;
    const gold = c.bucketGoldCount;
    const first = c.pour(PAN_VOLUME)!;
    expect(first.light + first.black + first.clay).toBeCloseTo(Math.min(PAN_VOLUME, total));
    const rest = c.pour(99)!;
    expect(first.gold.length + rest.gold.length).toBe(gold);
    expect(c.bucketVolume).toBeCloseTo(0);
    expect(c.pour(1)).toBeNull();
  });
});

describe('screened material downstream', () => {
  const skilled = (pan: Pan) => (pan.clay > 0 || pan.stratification < 0.5 ? { tilt: 0, shake: 1 } : { tilt: 0.4, shake: 1 });

  it('pans with no rocks to rake, and faster from a fine screen', () => {
    const time = (size: 'coarse' | 'fine') => {
      let seconds = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const rng = createRng(seed);
        const c = new Classifier(rng);
        c.setScreen(size);
        c.load(shovelful(rng));
        screen(c);
        c.tipOff();
        const pan = Pan.fromScreened(rng, c.pour(PAN_VOLUME)!);
        expect(pan.rocks).toHaveLength(0);
        for (let t = 0; t < 300 && !pan.workedDown; t += DT) pan.step(DT, skilled(pan));
        seconds += pan.elapsed;
      }
      return seconds;
    };
    expect(time('fine')).toBeLessThan(time('coarse'));
  });

  it('keeps more gold through a sluice: no rock jams, and pickers found on the screen', () => {
    const run = (classified: boolean) => {
      let kept = 0;
      let fed = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const rng = createRng(seed);
        const sluice = new Sluice(rng, { slope: 0.6, flow: 0.9 });
        const c = new Classifier(rng);
        for (let i = 0; i < 12; i++) {
          const s = shovelful(rng, { ...ROCKY, clayiness: 0 });
          fed += totalMg(s.gold) + totalMg(pickersIn(s));
          if (classified) {
            c.load(s);
            screen(c);
            for (const rock of [...c.rocks]) kept += c.inspectRock(rock.id)?.mg ?? 0;
            c.tipOff();
            sluice.feedScreened(c.pour(99)!);
          } else {
            (sluice as unknown as { addToHeader: (...a: unknown[]) => void }).addToHeader(s.lightSand, s.blackSand, s.clay, s.rocks, s.gold);
          }
          for (let t = 0; t < 2.5; t += DT) {
            sluice.step(DT, { flow: 0.75 });
            if (sluice.jammed) while (sluice.clog > 0.3) sluice.rake();
          }
        }
        for (let t = 0; t < 6; t += DT) sluice.step(DT, { flow: 0.75 });
        kept += totalMg(sluice.liftMat().gold);
      }
      return kept / fed;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 0.05);
  });
});

describe('where and how the classifier is had', () => {
  it('is sold for $15 and works everywhere but the Home Creek', () => {
    const region = new Region(createRng(9));
    const found = region.follow(region.clueFound().id);
    expect(region.allowsHandGear(region.home)).toBe(false);
    if (found.found) expect(region.allowsHandGear(found.creek)).toBe(true);
    const session = new PanningSession(createRng(9));
    session.cash = 15;
    expect(buyGear(session, 'classifier')).toBe('bought');
    expect(session.owns('classifier')).toBe(true);
    expect(session.cash).toBe(0);
  });

  it('survives a save mid-screen, and nobody has one in a version 6 save', () => {
    const rng = createRng(10);
    const region = new Region(rng);
    const session = new PanningSession(rng);
    session.acquire('classifier');
    session.classifier!.setScreen('fine');
    session.classifier!.load(shovelful(rng));
    for (let i = 0; i < 20; i++) session.classifier!.step(DT, 1);
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'bank', creekId: region.home.id, spotId: null }, 0)));
    const loaded = loadSave(save, createRng(11))!;
    expect(loaded.session.classifier!.snapshot()).toEqual(session.classifier!.snapshot());
    delete save.session.classifier;
    const old = loadSave({ ...save, version: 6 }, createRng(12))!;
    expect(old.session.owns('classifier')).toBe(false);
  });
});
