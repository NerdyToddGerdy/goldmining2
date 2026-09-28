import { describe, expect, it } from 'vitest';
import { MILESTONES, noteMilestones } from './milestones';
import { buyGear } from './outfitter';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import { Crew } from './staffing';

describe('getting started', () => {
  it('notes each first step once, and never un-ticks it', () => {
    const region = new Region(createRng(1));
    const session = new PanningSession(createRng(1));
    const crew = new Crew(createRng(1));
    const world = { region, crew };
    expect(noteMilestones(session, world)).toEqual([]);
    session.vial.push({ id: 1, size: 'fine', mg: 0.05 });
    expect(noteMilestones(session, world)).toEqual(['colour']);
    session.sellVial();
    expect(noteMilestones(session, world)).toEqual(['sold']);
    session.jar.blackSand = 0.1;
    expect(noteMilestones(session, world)).toEqual(['blackSand']);
    session.jar.blackSand = 0; // Panned down: still done.
    expect(session.milestones.has('blackSand')).toBe(true);
    region.clueFound();
    expect(noteMilestones(session, world)).toEqual(['lead']);
    session.cash = 100;
    buyGear(session, 'rocker');
    crew.hire(session, false, 'hand');
    expect(noteMilestones(session, world).sort()).toEqual(['crew', 'machine']);
    expect(noteMilestones(session, world)).toEqual([]);
    expect(MILESTONES.map((m) => m.id)).toContain('claim');
  });

  it('keeps what was done through a save; an older save starts with none', () => {
    const region = new Region(createRng(2));
    const session = new PanningSession(createRng(2));
    session.earned = 3;
    noteMilestones(session, { region, crew: new Crew(createRng(2)) });
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: region.home.id, spotId: null }, 0)));
    expect([...loadSave(save, createRng(3))!.session.milestones].sort()).toEqual(['colour', 'sold']);
    delete save.session.milestones;
    expect(loadSave({ ...save, version: 23 }, createRng(3))!.session.milestones.size).toBe(0);
  });
});
