import { describe, expect, it } from 'vitest';
import { HIGHBANKER_TUNING, Highbanker } from './highbanker';
import { totalMg, type GoldPiece, type PanLoad } from './pan';
import { createRng } from './rng';
import { Sluice } from './sluice';

const LOAD: PanLoad = { richness: 5, clayiness: 0.3, rockiness: 0.5 };
const DT = 1 / 20;

/** A running, primed highbanker with a full tank. */
function running(seed: number): Highbanker {
  const hb = new Highbanker(createRng(seed));
  hb.refuel();
  hb.prime();
  hb.start();
  return hb;
}

/**
 * Keep the hopper fed for `seconds` at `throttle`, dealing with trouble the way a player would:
 * re-prime, clear jams, rake clogs, refuel, let it cool. Cleans out every `cleanEvery` loads.
 */
function run(seed: number, throttle: number, seconds: number, cleanEvery = 10) {
  const hb = running(seed);
  const caught: GoldPiece[] = [];
  let loads = 0;
  let since = 0;
  const events: Record<string, number> = {};
  for (let t = 0; t < seconds; t += DT) {
    // Stop feeding once a cleanout is due, so the hopper runs empty for it.
    if (since < cleanEvery && !hb.hopperFull && hb.hopperVolume < 1 && hb.feed(LOAD)) (loads++, since++);
    const e = hb.step(DT, throttle);
    if (e.event) events[e.event] = (events[e.event] ?? 0) + 1;
    if (!hb.primed) hb.prime();
    if (hb.jammed) hb.clearGrizzly();
    if (hb.sluice.clog > 0.3) hb.sluice.rake();
    if (hb.fuel <= 0) hb.refuel();
    if (!hb.running && !hb.tooHot) hb.start();
    if (since >= cleanEvery && hb.hopperVolume < 0.01 && hb.sluice.headerVolume < 0.02) {
      for (let r = 0; r < 3 / DT; r++) hb.step(DT, throttle);
      caught.push(...hb.sluice.liftMat().gold);
      since = 0;
    }
  }
  caught.push(...hb.sluice.liftMat().gold);
  return { hb, loads, caught, events };
}

describe('Highbanker', () => {
  it('moves no water until primed and running', () => {
    const hb = new Highbanker(createRng(1));
    hb.feed(LOAD);
    expect(hb.start()).toBe('noFuel');
    hb.refuel();
    expect(hb.start()).toBe('started');
    const dry = hb.step(1, 0.6);
    expect(dry.spraying).toBe(false);
    expect(dry.passed).toBe(0);
    hb.prime();
    expect(hb.step(0.5, 0.6).spraying).toBe(true);
  });

  it('runs balanced at a middling throttle and overpowered flat out', () => {
    const hb = running(2);
    expect(hb.step(0.1, 0.65).sluice.state).toBe('balanced');
    expect(hb.step(0.1, 1).sluice.state).toBe('overpowered');
    expect(hb.step(0.1, 0.2).sluice.state).toBe('underpowered');
  });

  it('moves much more gravel than a hand sluice fed at a player’s pace, and recovers most of it', () => {
    let hbLoads = 0;
    let recovery = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = run(seed, 0.65, 240);
      hbLoads += r.loads;
      recovery += totalMg(r.caught) / r.hb.fedMg;
    }
    // A hand sluice keeps up with a shovelful every 2.5 s or so: about 96 in 240 s.
    expect(hbLoads / 8).toBeGreaterThan(120);
    expect(recovery / 8).toBeGreaterThan(0.6);
  });

  it('runs hot pushed hard, and stalls; running dry overheats in seconds', () => {
    const hard = running(3);
    let stalled = false;
    for (let t = 0; t < 200 && !stalled; t += DT) {
      if (!hard.primed) hard.prime();
      stalled = hard.step(DT, 1).event === 'overheated';
    }
    expect(stalled).toBe(true);
    expect(hard.start()).toBe('tooHot');
    const easy = running(3);
    for (let t = 0; t < 200; t += DT) {
      if (!easy.primed) easy.prime();
      easy.step(DT, 0.6);
    }
    expect(easy.running).toBe(true);
    const dry = new Highbanker(createRng(4));
    dry.refuel();
    dry.start();
    let seconds = 0;
    while (dry.running && seconds < 60) (dry.step(DT, 0.5), (seconds += DT));
    expect(seconds).toBeLessThan(12);
  });

  it('loses prime now and then, more often at high throttle', () => {
    const count = (throttle: number): number => {
      let losses = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const hb = running(seed);
        for (let t = 0; t < 300; t += DT) {
          if (hb.step(DT, throttle).event === 'lostPrime') (losses++, hb.prime());
          hb.heat = 0;
          hb.fuel = HIGHBANKER_TUNING.tank;
        }
      }
      return losses;
    };
    expect(count(0.4)).toBeGreaterThan(3);
    expect(count(1)).toBeGreaterThan(count(0.4));
  });

  it('jams on rocks, and passes nothing until cleared', () => {
    const hb = running(5);
    let jammed = false;
    for (let i = 0; i < 400 && !jammed; i++) {
      hb.feed({ ...LOAD, rockiness: 1 });
      if (!hb.primed) hb.prime();
      hb.heat = 0;
      jammed = hb.step(0.5, 0.8).event === 'jammed' || hb.jammed;
    }
    expect(hb.jammed).toBe(true);
    const before = hb.hopperVolume;
    hb.step(1, 0.8);
    expect(hb.hopperVolume).toBeCloseTo(before);
    expect(hb.clearGrizzly()).toBeGreaterThan(0);
    expect(hb.jammed).toBe(false);
  });

  it('stops when the tank runs dry', () => {
    const hb = running(6);
    hb.fuel = 1;
    let ran = 0;
    while (hb.running && ran < 10) (hb.step(DT, 1), (ran += DT));
    expect(hb.running).toBe(false);
    expect(ran).toBeLessThan(1.2);
    expect(hb.start()).toBe('noFuel');
  });

  it('conserves gold: all of it is in the hopper, the sluice, or lost', () => {
    const { hb, caught } = run(7, 0.7, 60, 99);
    hb.feed(LOAD);
    hb.step(0.5, 0.7);
    const snap = hb.snapshot();
    const inHopper = totalMg(snap.hopper.gold) + totalMg(snap.hopper.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
    const header = (hb.sluice as unknown as { header: { gold: GoldPiece[] } }).header.gold;
    const onMat = totalMg(hb.sluice.liftMat().gold);
    expect(totalMg(caught) + inHopper + totalMg(header) + onMat + totalMg(hb.sluice.lost)).toBeCloseTo(hb.fedMg);
  });

  it('round-trips through a snapshot', () => {
    const { hb } = run(8, 0.6, 20, 99);
    hb.feed(LOAD);
    const copy = new Highbanker(createRng(99), JSON.parse(JSON.stringify(hb.snapshot())));
    expect(copy.snapshot()).toEqual(hb.snapshot());
    expect(copy.sluice).toBeInstanceOf(Sluice);
  });
});
