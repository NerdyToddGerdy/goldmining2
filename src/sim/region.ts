import { Creek, HOME_CREEK_PROFILE, type CreekProfile, type CreekSnapshot, type DigSpot } from './creek';
import { estimateAround, type Estimate } from './estimate';
import type { PanningSession } from './panningSession';
import { normal, type Rng } from './rng';

/**
 * The region around the Home Creek: the creeks the player knows, the leads they hold, and the
 * leads for sale in town. Leads point to further creek stretches. Their reported richness is an
 * Estimate, never the truth, and some lead nowhere.
 */

export type LeadSource = 'colourTrail' | 'clue' | 'rumour' | 'claimRecord' | 'mapFragment';
export type LeadStatus = 'open' | 'followed' | 'dud';

export interface Lead {
  readonly id: number;
  readonly source: LeadSource;
  /** The stretch's name, as the lead gives it. */
  readonly name: string;
  readonly note: string;
  /** What the lead suggests about richness, relative to the Home Creek. Never exact. */
  readonly richness: Estimate;
  /**
   * What the lead says about the ground, e.g. that there is room and steady water for a sluice.
   * Like the richness, it can be wrong.
   */
  readonly hint: string | null;
  status: LeadStatus;
  /** The creek found by following it. */
  creekId: number | null;
  /** Hidden truth: whether there is anything there, and how rich it really is. */
  readonly truth: { readonly real: boolean; readonly richness: number; readonly bend: boolean };
}

export interface LeadOffer {
  readonly lead: Lead;
  readonly price: number;
}

interface SourceTraits {
  /** Chance the lead is real. */
  readonly reliability: number;
  /** Relative width of the richness estimate: vaguer sources say less. */
  readonly vagueness: number;
  /** How much the source talks things up. */
  readonly optimism: number;
  readonly price: readonly [number, number];
}

export const LEAD_SOURCES: Record<LeadSource, SourceTraits> = {
  colourTrail: { reliability: 1, vagueness: 0.5, optimism: 1, price: [0, 0] },
  clue: { reliability: 0.75, vagueness: 1.4, optimism: 1.1, price: [0, 0] },
  rumour: { reliability: 0.55, vagueness: 2, optimism: 1.6, price: [2, 4] },
  claimRecord: { reliability: 0.85, vagueness: 1, optimism: 1.1, price: [8, 12] },
  mapFragment: { reliability: 0.95, vagueness: 0.6, optimism: 1, price: [15, 25] },
};

export const REGION_TUNING = {
  /** Offers on the claims board are replaced after this many gravel pans. */
  offerRefreshPans: 12,
  offerCount: 3,
  /** Real stretches: lognormal richness around this, relative to the Home Creek. */
  stretchRichness: 1.3,
  stretchRichnessSigma: 0.5,
  /** Share of stretches that are creek bends, with room and water for a sluice. */
  bendChance: 0.35,
} as const;

const BEND_HINT = 'Mentions a wide gravel bar with steady water: room for a sluice.';

const NAME_FIRST = ['Coyote', 'Tin Cup', 'Grubstake', 'Lost Horse', 'Magpie', 'Deadwood', 'Sluicebox', 'Nugget', 'Two Pine', 'Blue Jay', 'Hangman', 'Whiskey', 'Old Man', 'Rattlesnake', 'Bitter Root'];
const NAME_SECOND = ['Gulch', 'Creek', 'Run', 'Bar', 'Draw', 'Fork', 'Wash', 'Hollow'];

const NOTES: Record<LeadSource, string[]> = {
  colourTrail: ['You followed the colour up the gully to where it comes from.'],
  clue: ['A rusted pan with a name scratched in it.', 'A survey stake with a creek name on the tag.', 'A tobacco tin holding a folded note and a sketch.'],
  rumour: ['An old-timer swears he took an ounce a day there.', 'Talk at the store says someone struck it rich.', 'A drifter mentioned it over coffee, then left town fast.'],
  claimRecord: ['A lapsed claim filing, with sample weights noted.', 'An old claim record, boundaries and all.'],
  mapFragment: ['A torn prospector’s map with a pay streak marked.', 'Part of a survey map, with colour marks along a creek.'],
};

let nextLeadId = 1;

export interface RegionSnapshot {
  readonly creeks: readonly CreekSnapshot[];
  readonly leads: readonly Lead[];
  readonly offers: readonly LeadOffer[];
  /** pansWorked when the board was last restocked; null means restock now. */
  readonly offersStockedAt: number | null;
}

export type FollowResult =
  | { readonly found: true; readonly lead: Lead; readonly creek: Creek }
  | { readonly found: false; readonly lead: Lead };

export class Region {
  readonly creeks: Creek[];
  readonly leads: Lead[];
  offers: LeadOffer[];
  offersStockedAt: number | null;

  constructor(
    private readonly rng: Rng,
    saved?: RegionSnapshot,
  ) {
    if (saved) {
      this.creeks = saved.creeks.map((c) => new Creek(rng, c));
      this.leads = structuredClone(saved.leads) as Lead[];
      this.offers = structuredClone(saved.offers) as LeadOffer[];
      this.offersStockedAt = saved.offersStockedAt;
      const ids = [...this.leads, ...this.offers.map((o) => o.lead)].map((l) => l.id);
      nextLeadId = Math.max(nextLeadId, ...ids.map((id) => id + 1));
      return;
    }
    this.creeks = [new Creek(rng, undefined, HOME_CREEK_PROFILE)];
    this.leads = [];
    this.offers = [];
    this.offersStockedAt = null;
  }

  snapshot(): RegionSnapshot {
    return structuredClone({
      creeks: this.creeks.map((c) => c.snapshot()),
      leads: this.leads,
      offers: this.offers,
      offersStockedAt: this.offersStockedAt,
    });
  }

  get home(): Creek {
    return this.creeks[0]!;
  }

  /**
   * Whether hand gear beyond the shovel and pan (the classifier) can be used at a creek. Every
   * found stretch has room; the Home Creek is a micro-site and stays shovel-and-pan only, forever.
   */
  allowsHandGear(creek: Creek): boolean {
    return creek !== this.home;
  }

  creek(id: number): Creek {
    const creek = this.creeks.find((c) => c.id === id);
    if (!creek) throw new Error(`No creek ${id}`);
    return creek;
  }

  lead(id: number): Lead {
    const lead = this.leads.find((l) => l.id === id);
    if (!lead) throw new Error(`No lead ${id}`);
    return lead;
  }

  /**
   * Colour in a pan from a source gully: the trail is found and walked in one go, so the
   * lead comes back already followed. Returns null for barren gullies or ones already traced.
   */
  traceGully(spot: DigSpot): FollowResult | null {
    if (!spot.gully?.source || spot.gully.traced) return null;
    spot.gully.traced = true;
    const lead = this.makeLead('colourTrail');
    this.leads.push(lead);
    return this.follow(lead.id);
  }

  /** The shovel turned something up. The lead goes in the notebook to follow later. */
  clueFound(): Lead {
    const lead = this.makeLead('clue');
    this.leads.push(lead);
    return lead;
  }

  /** Restock the claims board once enough panning has happened since it was last stocked. */
  restockOffers(pansWorked: number): boolean {
    if (this.offersStockedAt !== null && pansWorked - this.offersStockedAt < REGION_TUNING.offerRefreshPans) return false;
    const sources: LeadSource[] = ['rumour', 'claimRecord', 'mapFragment'];
    this.offers = Array.from({ length: REGION_TUNING.offerCount }, () => {
      const source = sources[this.rng.int(0, sources.length - 1)]!;
      const [min, max] = LEAD_SOURCES[source].price;
      return { lead: this.makeLead(source), price: Math.round(this.rng.range(min, max)) };
    });
    this.offersStockedAt = pansWorked;
    return true;
  }

  /** Buy a lead off the board. Returns null if the player can't afford it. */
  buy(leadId: number, session: PanningSession): Lead | null {
    const index = this.offers.findIndex((o) => o.lead.id === leadId);
    const offer = this.offers[index];
    if (!offer || session.cash < offer.price) return null;
    session.cash = Math.round((session.cash - offer.price) * 100) / 100;
    this.offers.splice(index, 1);
    this.leads.push(offer.lead);
    return offer.lead;
  }

  /** Walk out to where a lead points. A real one becomes a new creek on the map; a dud is marked as such. */
  follow(leadId: number): FollowResult {
    const lead = this.lead(leadId);
    if (lead.status === 'followed' && lead.creekId !== null) return { found: true, lead, creek: this.creek(lead.creekId) };
    if (!lead.truth.real) {
      lead.status = 'dud';
      return { found: false, lead };
    }
    const profile: CreekProfile = {
      name: lead.name,
      richness: lead.truth.richness,
      renewing: false,
      spotCount: this.rng.int(3, 5),
      gullyCount: this.rng.int(0, 2),
      sourceChance: 0.5,
      sluiceSites: lead.truth.bend ? this.rng.int(1, 2) : 0,
    };
    const creek = new Creek(this.rng, undefined, profile);
    this.creeks.push(creek);
    lead.status = 'followed';
    lead.creekId = creek.id;
    return { found: true, lead, creek };
  }

  private makeLead(source: LeadSource): Lead {
    const traits = LEAD_SOURCES[source];
    const rng = this.rng;
    const real = rng.next() < traits.reliability;
    const richness = REGION_TUNING.stretchRichness * Math.exp(normal(rng) * REGION_TUNING.stretchRichnessSigma);
    // A dud still claims something: what it says is invented, around a typical stretch.
    const claimed = (real ? richness : REGION_TUNING.stretchRichness) * traits.optimism * rng.range(0.75, 1.3);
    const notes = NOTES[source];
    // Whether the ground has room for a sluice, and whether the lead says so. Better sources are
    // more likely to mention a real bar and less likely to invent one.
    const bend = rng.next() < REGION_TUNING.bendChance;
    const mentionsBar = bend ? rng.next() < 0.4 + 0.5 * traits.reliability : rng.next() < (1 - traits.reliability) * 0.4;
    return {
      id: nextLeadId++,
      source,
      name: `${NAME_FIRST[rng.int(0, NAME_FIRST.length - 1)]} ${NAME_SECOND[rng.int(0, NAME_SECOND.length - 1)]}`,
      note: notes[rng.int(0, notes.length - 1)]!,
      richness: estimateAround(claimed, traits.vagueness),
      hint: mentionsBar ? BEND_HINT : null,
      status: 'open',
      creekId: null,
      truth: { real, richness, bend },
    };
  }
}
