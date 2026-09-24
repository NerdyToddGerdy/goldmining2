import { describe, expect, it } from 'vitest';
import { HomeCreek } from './creek';
import { totalMg } from './pan';
import { PanningSession } from './panningSession';
import { createRng } from './rng';
import { createSave, loadSave, SAVE_VERSION } from './save';

const DT = 1 / 30;

/** A game with some history: dug spots, gold in the vial, black sand in the jar, a pan mid-work. */
function playedGame() {
  const rng = createRng(21);
  const creek = new HomeCreek(rng);
  const session = new PanningSession(rng);
  const spot = creek.spots[0]!;
  for (let i = 0; i < 12; i++) {
    while (spot.boulder) creek.pry(spot.id);
    while (spot.water >= 1) creek.bail(spot.id);
    const result = creek.shovel(spot.id, i % 3 === 0 ? 'pan' : 'spoil');
    if (result.ok && result.load && session.panIsFree) {
      const pan = session.startPan(result.load);
      for (let t = 0; t < 20; t += DT) pan.step(DT, { tilt: 0.4, swirl: 0.6, shake: 0 });
      pan.reveal();
      session.collect(true);
    }
  }
  const pan = session.startPan({ richness: 5, clayiness: 0.3, rockiness: 0.5 });
  for (let t = 0; t < 3; t += DT) pan.step(DT, { tilt: 0.3, swirl: 0.5, shake: 0 });
  return { creek, session, spotId: spot.id };
}

/** Saves go through JSON in the browser, so tests do too. */
const throughJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('save and load', () => {
  it('round-trips the creek, vial, jar, and a pan in progress', () => {
    const { creek, session, spotId } = playedGame();
    const save = throughJson(createSave(creek, session, { screen: 'pan', spotId }, 1000));
    const loaded = loadSave(save, createRng(99));
    expect(loaded).not.toBeNull();
    expect(loaded!.creek.snapshot()).toEqual(creek.snapshot());
    expect(loaded!.session.snapshot()).toEqual(session.snapshot());
    expect(loaded!.place).toEqual({ screen: 'pan', spotId });
    expect(loaded!.session.vialMg).toBeCloseTo(session.vialMg);
  });

  it('lets play continue after loading', () => {
    const { creek, session, spotId } = playedGame();
    const loaded = loadSave(throughJson(createSave(creek, session, { screen: 'pan', spotId }, 0)), createRng(5))!;
    const pan = loaded.session.pan!;
    const before = totalMg(pan.gold);
    for (let t = 0; t < 60 && !pan.workedDown; t += DT) pan.step(DT, { tilt: 0.4, swirl: 0.6, shake: 0 });
    pan.reveal();
    loaded.session.collect(true);
    expect(totalMg(pan.visible) + totalMg(pan.hidden) + totalMg(pan.lost)).toBeCloseTo(before);
    const spot = loaded.creek.spot(spotId);
    while (spot.boulder) loaded.creek.pry(spotId);
    while (spot.water >= 1) loaded.creek.bail(spotId);
    expect(loaded.creek.shovel(spotId, 'spoil').ok).toBe(true);
  });

  it('keeps new ids clear of restored ones', () => {
    const { creek, session } = playedGame();
    const loaded = loadSave(throughJson(createSave(creek, session, { screen: 'bank', spotId: null }, 0)), createRng(6))!;
    const oldIds = new Set([...loaded.session.vial, ...loaded.session.jar.gold].map((p) => p.id));
    loaded.session.pan!.reveal();
    loaded.session.collect(false);
    const fresh = loaded.session.startPan({ richness: 20, clayiness: 0, rockiness: 1 });
    for (const item of [...fresh.gold, ...fresh.rocks]) expect(oldIds.has(item.id)).toBe(false);
  });

  it('rejects data that is not a save it understands', () => {
    const rng = createRng(1);
    expect(loadSave(null, rng)).toBeNull();
    expect(loadSave('nonsense', rng)).toBeNull();
    expect(loadSave({ version: SAVE_VERSION + 1 }, rng)).toBeNull();
    const { creek, session } = playedGame();
    const good = throughJson(createSave(creek, session, { screen: 'creek', spotId: null }, 0)) as Record<string, unknown>;
    expect(loadSave({ ...good, session: { ...(good.session as object), vial: 'x' } }, rng)).toBeNull();
  });

  it('drops a remembered spot that no longer exists', () => {
    const { creek, session } = playedGame();
    const loaded = loadSave(throughJson(createSave(creek, session, { screen: 'bank', spotId: 9999 }, 0)), createRng(2))!;
    expect(loaded.place.spotId).toBeNull();
  });
});
