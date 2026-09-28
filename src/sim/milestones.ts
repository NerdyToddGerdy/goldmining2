import type { Crew } from './staffing';
import type { PanningSession } from './panningSession';
import type { Region } from './region';

/**
 * The early game's first steps, for the getting-started checklist on the tablet. Each is noted the
 * first time it happens and kept in the save, so emptying the jar or selling everything never
 * un-ticks one. The list is a guide, never a gate: nothing is locked behind it.
 */
export type Milestone = 'colour' | 'sold' | 'blackSand' | 'lead' | 'claim' | 'machine' | 'crew';

export const MILESTONES: readonly { readonly id: Milestone; readonly goal: string; readonly how: string }[] = [
  { id: 'colour', goal: 'Pan some colour', how: 'Dig at a spot on the creek, shovel into the pan, wash the sand away and pick out the gold.' },
  { id: 'sold', goal: 'Sell it in town', how: 'The buyer at the assay office weighs the vial and pays spot less a cut.' },
  { id: 'blackSand', goal: 'Save black sand', how: 'Collect with "save black sand": the jar keeps the fine gold hidden in it, to pan later.' },
  { id: 'lead', goal: 'Find a lead', how: 'Clues turn up while digging, colour up a gully points upstream, or buy one in town.' },
  { id: 'claim', goal: 'Stake a new stretch', how: 'Follow a lead from the notebook on the region map.' },
  { id: 'machine', goal: 'Buy a machine', how: 'A sluice for a creek bend, a rocker box for most other ground: at the outfitter.' },
  { id: 'crew', goal: 'Hire a crew', how: 'In town, Claims & crew: they work your stretches while you are elsewhere.' },
];

const MACHINES = ['sluice', 'rocker', 'highbanker', 'drywasher', 'trommel'] as const;

/** Note any first steps that have now happened. Returns the ones newly done. */
export function noteMilestones(session: PanningSession, world: { readonly region: Region; readonly crew: Crew }): Milestone[] {
  const reached: Record<Milestone, boolean> = {
    colour: session.vial.length > 0 || session.earned > 0,
    sold: session.earned > 0,
    blackSand: session.jar.blackSand > 0.001,
    lead: world.region.leads.length > 0,
    claim: world.region.creeks.length > 1,
    machine: MACHINES.some((m) => session.owns(m)),
    crew: world.crew.workers.length > 0,
  };
  const fresh: Milestone[] = [];
  for (const { id } of MILESTONES) {
    if (reached[id] && !session.milestones.has(id)) {
      session.milestones.add(id);
      fresh.push(id);
    }
  }
  return fresh;
}
