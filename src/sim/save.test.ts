import { describe, expect, it } from 'vitest';
import { totalMg } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave, SAVE_VERSION, type SavedPlace } from './save';

const DT = 1 / 30;

/** A game with some history: dug spots, gold in the vial, black sand in the jar, a lead, a pan mid-work. */
function playedGame() {
  const rng = createRng(21);
  const region = new Region(rng);
  const session = new PanningSession(rng);
  const creek = region.home;
  const spot = creek.creekSpots[0]!;
  for (let i = 0; i < 12; i++) {
    while (spot.boulder) creek.pry(spot.id);
    while (spot.water >= 1) creek.bail(spot.id);
    const result = creek.shovel(spot.id, i % 3 === 0 ? 'pan' : 'spoil');
    if (result.ok && result.load && session.panIsFree) {
      const pan = session.startPan(result.load);
      for (let t = 0; t < 20; t += DT) pan.step(DT, { tilt: 0.4, slosh: 0.6, shake: 0 });
      pan.reveal();
      session.collect(true);
    }
  }
  region.restockOffers(session.pansWorked);
  region.clueFound();
  const pan = session.startPan({ richness: 5, clayiness: 0.3, rockiness: 0.5 });
  for (let t = 0; t < 3; t += DT) pan.step(DT, { tilt: 0.3, slosh: 0.5, shake: 0 });
  return { region, session, creekId: creek.id, spotId: spot.id };
}

/** Saves go through JSON in the browser, so tests do too. */
const throughJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const place = (screen: SavedPlace['screen'], creekId: number, spotId: number | null): SavedPlace => ({ screen, creekId, spotId });

describe('save and load', () => {
  it('round-trips the region, vial, jar, leads, and a pan in progress', () => {
    const { region, session, creekId, spotId } = playedGame();
    const save = throughJson(createSave(region, session, place('pan', creekId, spotId), 1000));
    const loaded = loadSave(save, createRng(99));
    expect(loaded).not.toBeNull();
    expect(loaded!.region.snapshot()).toEqual(region.snapshot());
    expect(loaded!.session.snapshot()).toEqual(session.snapshot());
    expect(loaded!.place).toEqual(place('pan', creekId, spotId));
    expect(loaded!.session.vialMg).toBeCloseTo(session.vialMg);
  });

  it('lets play continue after loading', () => {
    const { region, session, creekId, spotId } = playedGame();
    const loaded = loadSave(throughJson(createSave(region, session, place('pan', creekId, spotId), 0)), createRng(5))!;
    const pan = loaded.session.pan!;
    const before = totalMg(pan.gold);
    for (let t = 0; t < 60 && !pan.workedDown; t += DT) pan.step(DT, { tilt: 0.4, slosh: 0.6, shake: 0 });
    pan.reveal();
    loaded.session.collect(true);
    expect(totalMg(pan.visible) + totalMg(pan.hidden) + totalMg(pan.lost)).toBeCloseTo(before);
    const creek = loaded.region.creek(creekId);
    const spot = creek.spot(spotId);
    while (spot.boulder) creek.pry(spotId);
    while (spot.water >= 1) creek.bail(spotId);
    expect(creek.shovel(spotId, 'spoil').ok).toBe(true);
  });

  it('keeps new ids clear of restored ones', () => {
    const { region, session, creekId } = playedGame();
    const loaded = loadSave(throughJson(createSave(region, session, place('bank', creekId, null), 0)), createRng(6))!;
    const oldIds = new Set([...loaded.session.vial, ...loaded.session.jar.gold].map((p) => p.id));
    loaded.session.pan!.reveal();
    loaded.session.collect(false);
    const fresh = loaded.session.startPan({ richness: 20, clayiness: 0, rockiness: 1 });
    for (const item of [...fresh.gold, ...fresh.rocks]) expect(oldIds.has(item.id)).toBe(false);
    const oldLeadIds = new Set(loaded.region.leads.map((l) => l.id));
    expect(oldLeadIds.has(loaded.region.clueFound().id)).toBe(false);
  });

  it('rejects data that is not a save it understands', () => {
    const rng = createRng(1);
    expect(loadSave(null, rng)).toBeNull();
    expect(loadSave('nonsense', rng)).toBeNull();
    expect(loadSave({ version: SAVE_VERSION + 1 }, rng)).toBeNull();
    const { region, session, creekId } = playedGame();
    const good = throughJson(createSave(region, session, place('creek', creekId, null), 0)) as Record<string, unknown>;
    expect(loadSave({ ...good, session: { ...(good.session as object), vial: 'x' } }, rng)).toBeNull();
  });

  it('carries money and the town through a save', () => {
    const { region, session, creekId } = playedGame();
    session.cash = 12.34;
    const loaded = loadSave(throughJson(createSave(region, session, place('town', creekId, null), 0)), createRng(3))!;
    expect(loaded.session.cash).toBeCloseTo(12.34);
    expect(loaded.place.screen).toBe('town');
  });

  it('drops a remembered spot or creek that no longer exists', () => {
    const { region, session, creekId } = playedGame();
    const loaded = loadSave(throughJson(createSave(region, session, place('bank', creekId, 9999), 0)), createRng(2))!;
    expect(loaded.place.spotId).toBeNull();
    const lost = loadSave(throughJson(createSave(region, session, place('bank', 9999, null), 0)), createRng(2))!;
    expect(lost.place.creekId).toBe(lost.region.home.id);
  });
});

describe('migrating old saves', () => {
  /** Build what an older version wrote, from a current save. */
  function asVersion2(): Record<string, unknown> {
    const { region, session, creekId, spotId } = playedGame();
    const v3 = throughJson(createSave(region, session, place('bank', creekId, spotId), 0)) as {
      region: { creeks: { spots: Record<string, unknown>[]; highWaterEvents: number }[] };
      place: Record<string, unknown>;
    } & Record<string, unknown>;
    const home = v3.region.creeks[0]!;
    const { region: _region, ...rest } = v3;
    const { creekId: _creekId, ...v2Place } = v3.place;
    return {
      ...rest,
      version: 2,
      creek: { spots: home.spots.filter((s) => !s.gully).map(({ gully: _g, ...s }) => s), highWaterEvents: home.highWaterEvents },
      place: v2Place,
    };
  }

  it('upgrades a version 2 save into a region with the Home Creek, keeping everything', () => {
    const v2 = asVersion2();
    const loaded = loadSave(v2, createRng(4));
    expect(loaded).not.toBeNull();
    const home = loaded!.region.home;
    expect(home.profile.name).toBe('Home Creek');
    expect(home.creekSpots).toHaveLength((v2.creek as { spots: unknown[] }).spots.length);
    // Old creeks get gullies so the Home Creek can still lead somewhere.
    expect(home.gullySpots.length).toBeGreaterThan(0);
    expect(home.gullySpots.some((s) => s.gully?.source)).toBe(true);
    expect(loaded!.place.creekId).toBe(home.id);
  });

  it('upgrades a version 1 save all the way', () => {
    const v2 = asVersion2();
    const { cash: _c, earned: _e, soldMg: _s, ...v1Session } = v2.session as Record<string, unknown>;
    const loaded = loadSave({ ...v2, version: 1, session: v1Session }, createRng(4));
    expect(loaded).not.toBeNull();
    expect(loaded!.session.cash).toBe(0);
  });
});
