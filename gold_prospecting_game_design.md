# Gold Prospecting Game — Core Design Brief

## Vision

Build a prospecting and small-scale mining game in which mining locations are finite, physical, and strategically different. The player begins with simple hand tools, finds and works claims, develops sites that can support progressively more capable equipment, and must eventually move on as deposits become exhausted or unprofitable.

The central fantasy is not owning one endlessly productive mine. It is becoming capable of:

1. Reading terrain and finding promising ground.
2. Deciding how much to invest before certainty is available.
3. Building an operation appropriate to a location's physical constraints.
4. Hiring people to maintain current income while personally searching for the next opportunity.
5. Recovering from poor investments by returning to low-cost creek prospecting.
6. Interacting with every machine through a distinct, visually readable UX.

## Design Pillars

- **Locations are finite.** Every claim has limited reserves, changing quality, and a point at which continuing is no longer worthwhile.
- **Terrain matters.** Location footprint, water, access, depth, stability, and environmental constraints determine what equipment and staffing are viable.
- **Prospecting matters forever.** The player always needs future leads because current locations eventually decline.
- **Failure is recoverable.** Running out of money means downsizing and returning to basic prospecting, not an immediate game over.
- **Staff buy time, not automatic victory.** Workers keep established claims running while the player prospects, surveys, repairs, negotiates, or develops a new site.
- **Every tool is a distinct interaction.** Gear should have its own material flow, visuals, operating decisions, failure states, and harvest payoff.
- **Physical readability comes before spreadsheets.** Players should understand a machine's condition by watching water, dirt, belts, dust, concentrate, fuel, and movement.

---

## Core Game Loop

```text
Prospect
→ evaluate lead
→ claim location
→ develop only what the site supports
→ extract material
→ manage equipment, workers, costs, and depletion
→ decide whether to deepen, improve, shut down, reclaim, or relocate
→ prospect for the next opportunity
```

### 1. Prospect

The player spends time, supplies, money, maps, or survey actions to find leads. Early leads are uncertain and might be rumors, visible terrain signs, old records, stream samples, or advice from local contacts.

Prospecting should reveal incomplete information first:

- Likely material type.
- Possible reserve size.
- Water availability.
- Location footprint.
- Access difficulty.
- Terrain and safety risks.
- Claim or permit friction.
- Potentially suitable equipment.

Better prospecting reduces the chance of investing in a poor site. It should not remove uncertainty entirely.

### 2. Claim

A claim secures access to a location and introduces carrying costs or obligations. A player should not be able to hold unlimited claims without consequence.

Possible claim mechanics:

- Lease or holding fees.
- Limited claim slots.
- Rival interest or claim competition.
- Access improvements required before operation.
- Reputation or permit requirements for better land.
- A sell, abandon, transfer, or reclaim option.

### 3. Develop

Development converts a discovered place into a working operation. The player chooses how much infrastructure to build before knowing every detail of the deposit.

Possible development elements:

- Access path or road.
- Small camp, storage cache, or workshop.
- Water intake, hoses, pump, or recirculating system.
- Power generation and fuel storage.
- Processing area.
- Settling pond or water-management infrastructure.
- Survey grid or test pits.

A site cannot host every type of development. Its physical constraints should matter more than an arbitrary player-level gate.

### 4. Extract

Extraction turns known reserves into money, material, knowledge, and future leads. It also consumes the valuable part of the site.

The player chooses among operating policies:

- Extract efficiently.
- Extract aggressively.
- Conserve the claim.
- Maintain and prepare.
- Survey an extension.
- Close and reclaim.

### 5. Exhaust, exit, or revisit

Sites should not only become empty. A site can become:

- Fully depleted.
- Too low-grade to be profitable with current equipment.
- Worth revisiting later with better recovery technology.
- Flooded, inaccessible, or seasonally unusable.
- Too expensive to operate due to labor, fuel, or lease costs.
- Unsafe, restricted, or environmentally sensitive.
- A source of tailings recovery or a clue to a nearby deposit.

The player should leave a declining site with money, a lead, an asset, knowledge, a reputation benefit, or a later reason to return.

---

## Location System

A location is not just a resource node. It is a physical place with a reserve profile, capacity limits, risks, and a specific operational character.

### Location traits

| Trait | Controls | Example consequence |
|---|---|---|
| Physical footprint | Number and scale of structures | A narrow creek fits a pan station and hand sluice but not a full wash plant |
| Water flow | Water-dependent processing | Seasonal flow supports limited manual work but not sustained high-throughput equipment |
| Access | Transport and heavy-equipment options | A remote ravine cannot receive a large truck without expensive development |
| Reserve size | Total recoverable material | A small pocket pays quickly but is exhausted in only a few work cycles |
| Material depth | Required digging and sampling capability | Surface flakes can be panned; buried pay gravel needs excavation |
| Ground stability | Safe expansion and staffing | Unstable banks limit pit depth, machinery, and crew size |
| Environmental sensitivity | Operational restrictions | Sensitive waterway conditions can limit the tools, timing, or scale of work |
| Site layout | Equipment compatibility | A broad bar can support storage and a processing line; a creek bend cannot |
| Seasonality | Operating window | Floods, droughts, frozen ground, or access problems change the best plan |

### Reserve layers

Use several reserve layers rather than one depletion bar:

- **Surface material:** Easy, quick, relatively low-value material.
- **Pay layer:** The main profitable deposit.
- **Deep or difficult material:** Requires upgraded tools, development, or more certainty.
- **Tailings/recovery layer:** Material made worthwhile by better future recovery technology.
- **Rare-find layer:** Low-probability nuggets, gems, artifacts, rare minerals, or unique discoveries.

This supports the idea that a claim may be depleted for a pan but profitable again for a later machine.

### Site archetypes

| Site type | Typical capacity | Strength | Constraint | Unlock potential |
|---|---|---|---|---|
| Home Creek | Micro | Free, permanent, always reachable | No room or steady flow for equipment | Shovel and pan only (see Home Creek) |
| Creek bend | Small | Cheap and accessible early income | Low throughput, limited space, seasonal water | Pan, hand sluice, compact classifier |
| Narrow ravine | Small to medium | Strong water or rich pockets | Difficult access, hazards, limited footprint | Winch, portable pump, compact highbanker |
| Gravel bar | Medium | Shallow deposits and usable space | Flood risk and shifting terrain | Sluice line, trommel, small camp |
| Dry wash | Small to medium | Water-independent material opportunity | Requires air-based processing and dust management | Drywasher, air classifier, water hauling |
| Hillside vein | Medium | Higher-value material and deeper progression | Surveying, drilling, excavation requirements | Crusher, generator, ore sorter |
| Abandoned diggings | Variable | Existing access, salvage, historical clues | Low remaining reserves, collapse or contamination risk | Salvage, reclamation, tailings recovery |
| Wide valley placer | Large | Major infrastructure and high throughput | High capital, competition, ongoing obligations | Wash plant, loader, conveyors, crew facilities |
| Remote district | Large to exceptional | Rare resources and late-game potential | High scouting, logistics, and risk | Advanced survey, satellite camp, specialized processing |

### In the game: site kinds

Every stretch found by following a lead is one of these. What it is decides what can be done there. Every lead reads the ground, with the same kind of uncertainty as its richness range:

- **Vague sources name two kinds:** a rumour or a clue says "a creek bend or a gravel bar". The truth is among them about 70% (rumours) or 80% (clues) of the time.
- **Firm sources name one:** a claim record or map fragment is right about 80% or 92% of the time. Firmer, never certain.
- **Benches:** a lead mentions a thin-water bench (sluice ground with a pump) about as reliably, and now and then invents one.
- **Plain words:** each reading is tagged by source ("talk has it", "recorded as", "marked on the map as") with a plain trust word ("often wrong", "usually right", "rarely wrong"), and says what each kind of ground means for the work.
- **Consistency:** the bench is decided when the lead is made, so the reading and the stretch agree when it's true.

| Kind | How often | Ground | Gear it takes | Hazard | Fee a day |
|---|---:|---|---|---|---:|
| Creek stretch | ~28% | 3–5 spots; sometimes a thin-water bench | Pan, classifier, rocker; a sluice on the bench with a pump | — | $1 ($2 with a bench) |
| Creek bend | ~30% | 3–5 spots, 1–2 steady sluice sites | Pan, classifier, rocker, sluice | — | $2 |
| Gravel bar | ~11% | 6–8 spots, shallow: thin overburden, broad gravel and pay | Pan, classifier, rocker, 2–3 steady sluice sites, and room for a trommel | Floods (about one game day in five): open holes half buried, worked-out spots given a thin fresh layer, a sluice there swept, stripped and choked | $3 |
| Narrow ravine | ~11% | 2–3 spots, rich bedrock pockets under broken rock; unstable walls, twice the boulders | Pan, classifier; no flat ground for a rocker; at most one sluice site, in fast, steep water | A long walk in (extra game time) | $2 |
| Dry wash | ~10% | 4–6 spots, shallow and fairly rich, no seep in the holes | No creek water to pan in or run a sluice. A wash tub makes panning possible, the drywasher works it with air, and the rocker runs on water hauled in (a long fetch). | — | $1 |
| Abandoned diggings | ~10% | 4–6 spots under the old-timers' tailings heaps: a thick top layer, washed of clay, that pays (unlike topsoil) but holds its gold as fines, since their riffles kept the coarse gold. Below, gravel they skimmed, a pay streak mostly taken, bedrock swept. First arrival turns up a few dollars of salvage (old riffle bars, a pick head, timber); the shovel finds clues about three times as often. | Pan, classifier, rocker; no sluice ground (they had it) | Old cuts: unstable walls, more slumps | $1 |

Creek maps, bank views and the region map draw each kind differently: a wide channel with pale bars, a narrow torrent between rock walls, a dry sandy bed and a dashed tributary, and grey tailings heaps with the old flume posts (a crossed pick and shovel on the map) for abandoned diggings.

Abandoned diggings are the tailings/recovery layer in miniature: ground someone else gave up is worth working again with better recovery. The tailings' fine gold punishes a rough pan and rewards a careful one, and pays better still for gear that holds fines.

---

## Equipment Unlocks by Site Scale

Equipment is unlocked by finding a site that can support it, not merely by reaching a generic level or having enough money.

### Small locations

Examples: creek, shallow wash, small tailings pile.

Available capabilities:

- Pan and hand tools.
- Hand sluice or rocker box.
- Basic classifier.
- Portable power.
- Small cache or one-person camp.
- Manual sampling.
- Basic cleanup and reclamation.

Gameplay purpose:

- Teach terrain reading and material processing.
- Provide a low-cost recovery option.
- Generate starter cash, small finds, and leads.
- Establish that small sites have genuine limits.

### Medium locations

Examples: gravel bar, ravine, hillside prospect, small hard-rock cut.

Available capabilities:

- Pump and highbanker or compact drywasher.
- Small trommel.
- Generator and repair bench.
- Camp, storage, and fuel cache.
- Limited excavation.
- Better sampling and early reserve estimates.
- One or more workers.

Gameplay purpose:

- Introduce logistics, layout, and maintenance.
- Require meaningful equipment choice.
- Create specialization around water, dry processing, shallow excavation, or salvage.

### Large locations

Examples: broad placer field, valley claim, established mine zone.

Available capabilities:

- Wash plant.
- Excavator or loader support.
- Conveyor and sorting line.
- Recirculating water system or settling pond.
- Larger camp and workshop.
- Multiple work crews.
- Advanced reserve mapping.
- Secure storage and transport contracts.

Gameplay purpose:

- Shift from hands-on extraction into operating a business.
- Make throughput, payroll, logistics, water, maintenance, and reserve management important.

### Exceptional locations

Examples: historic district, deep vein system, remote basin, rare-mineral discovery.

Available capabilities:

- Specialized processing.
- Deep exploration and drilling.
- Custom equipment modules.
- Linked claims and regional infrastructure.
- Investors, contracts, permits, and major reclamation decisions.

Gameplay purpose:

- Reward deep prospecting knowledge and a mature operational network.
- Present high-stakes choices between fast exploitation, sustainable operation, partnership, and sale.

---

## Economy, Depletion, and Recovery

### Profit model

A claim should be judged by net income rather than gross material moved.

```text
Net claim income = material recovered × market value
                 − labor
                 − fuel
                 − maintenance
                 − lease costs
                 − transport
                 − consumables
                 − debt or finance costs
```

The player should leave a site when it is no longer the best use of time, capital, and staff—not only when it reaches exactly zero material.

### Financial decline

| Financial state | Player loses | Player retains |
|---|---|---|
| Healthy operation | Nothing | Claims, staff, expansion, surveys, equipment |
| Cash-strained | Major new development and expensive repairs | Existing operation, small contracts, basic extraction |
| Insolvent | Payroll, leases, fuel contracts, costly transport | Portable gear, manual work, salvage options |
| Forced shutdown | Large-site operation and installed infrastructure | Creek panning, sampling, local leads, low-cost work |
| Recovery | Options return gradually | Reclaimable gear, micro-claims, cautious reinvestment |

### Back-to-basics recovery loop

If the player runs out of money, they should be forced to downsize—not forced to restart the entire game.

Low-cost recovery options:

- Return to the Home Creek and pan it with shovel and pan alone.
- Work old tailings with improved knowledge.
- Take short sample-collection or test-pan contracts.
- Sell, salvage, or scrap bulky equipment while retaining portable essentials.
- Trade small finds for supplies, map fragments, or favors.
- Use terrain knowledge to find overlooked micro-deposits.
- Work a low-fee temporary claim.

### In the game: time, claims and fees

- **Game time** passes only while the player is out working and has touched something in the last twenty seconds, and in fixed amounts for travel: a trip to town and back, a walk to another stretch, or following a lead out. Time in town or on the region map is covered by the travel cost. A closed or idle tab neither earns nor owes. A game day is ten minutes of active play, read as a ten-hour working day from 7 am to 5 pm. It's shown by the cash as "Day N · 1:15 pm", with a thin bar filling toward the next day.
- **Claims:** every found stretch is staked when found. A plain stretch costs $1 a day to hold, and one with ground for a sluice (including a thin-water bench) costs $2.
- **Paying:** fees and wages come out of cash automatically in town, as far as the cash goes, on arriving and after each sale.
- **Lapsing:** a claim more than three days behind lapses. It can't be dug, the sluice can't be set up on it, and a hand won't work it until it's paid up.
- **Ground left:** each claim in the Claims & crew tab shows roughly how much of the stretch is left to dig, to the nearest 10% ("About 60% of its ground left to dig", "Untouched", "Worked out"). It measures digging left, not gold left, so what the ground holds stays hidden.
- **Wear and repair kits:** every sluice, rocker, drywasher and highbanker wears with the material through it, faster fed unscreened rocks or run too hard (overpowered water, a choppy or flooded rocker, overblown air). A sluice lasts about 200 shovelfuls before it's worn out, a rocker or drywasher about 100; a highbanker's heavier box wears slower but its engine wears with running hours, faster run hot, and seizes when worn out. A worn machine still runs but keeps less of the fine gold (a worn-out one loses about half its fines), which the player sees as torn moss, reads in the inspect panel (sound, wearing, worn, worn out), and finds at cleanout. A **repair kit** ($5, carry four) puts any machine right in the close-up (Mend it, N); crews use the player's kits the way they use the fuel cans, and a crew highbanker with a seized engine stands idle until a kit arrives. The pan and shovel never wear.
- **Supplies:** crews at remote stretches cost supplies on top of wages, paid in town with them: $3 a day per crew member at a narrow ravine, $4 at a dry wash (water hauled in). Nearer stretches need none.
- **Releasing** a claim writes off what it owes; re-staking it later costs a $5 recording fee. A claim with the sluice set up on it can't be released until the sluice comes down. Released claims leave the ledger and fold into a "released claims" list at the end of Claims & crew, still there to re-stake, since ground given up for a pan can pay later for a better machine.
- **Being behind** (any claim lapsed, or wages more than a day overdue) blocks new gear, leads and hires. Nothing owned is ever taken, and fuel can still be bought. The Home Creek is never a claim and never costs anything, so panning it always pays the way back.

### In the game: going under and coming back

The decline table plays out as states worked out from what's owed (claim fees and wages) against cash on hand:

- **Healthy:** cash covers what's owed.
- **Strained:** owing more than cash on hand, nothing overdue yet. No hiring and no big purchases (crew gear, gear over $20); everything else carries on. Being behind while holding the cash is only strained, because fees and wages are paid automatically in town, so a player is never shut down for staying away from town.
- **Insolvent:** behind (a claim lapsed or wages more than a day overdue) and unable to cover it. With no money for payroll, the crew downs tools and walks off, and what they're owed stays owed. Nothing but fuel can be bought. "Insolvent: shutdown in ~2 days" shows under the clock.
- **Shutdown** (two game days insolvent): every claim is released and its fees written off, and each camp leaves $2 of salvage.
  - The player's sluice and highbanker are taken down and packed, and kept. A mat that won't fit in the jar waits in town.
  - Crew sites close, and crew machines are sold for scrap at half price. Scrap and salvage go to the wages owed.
  - The player comes away with a lead from someone they worked alongside, and is walked back to the Home Creek with a short story beat, not a game over.
- **Recovering:** after a shutdown, until what's still owed is paid off by panning and selling. Buying stays restricted; nothing more is taken. Paying it off brings the player back to healthy.

The shovel, the pan, the Home Creek, portable gear, field notes and leads are never touched in any state.

### Anti-death-spiral rules

- Basic panning should never require fuel, rent, repair parts, or a consumable that can reach zero.
- At least one free or nearly free prospecting location must remain accessible.
- Basic work should produce modest but reliable value.
- Time can be converted into cash, samples, reputation, material, or leads.
- Debt should restrict expansion rather than confiscate the basic recovery tools.
- A failed claim should yield some salvage, data, or future lead.

The recovery phase should feel scrappy and rewarding. An experienced player should recover more effectively than a new player because they retain knowledge, skills, contacts, and better judgment.

---

## Home Creek

The Home Creek is a standalone level: the player, a shovel, a pan, and a small creek. There are no other tools. It is the first place the player works and the place they return to after bankruptcy.

### Why only a shovel and a pan

The limit comes from the site, not from the player's level. The Home Creek is a micro-site: a narrow feeder creek with small gravel banks, shallow fast water, and no flat ground. There is no room to set a sluice and not enough steady flow to run one. The player learns the core rule in their first minutes: **this ground supports this much and no more.** Classifiers and sluices first appear at a larger creek-bend site, because the ground changed.

### Role in the game

| Situation | What the Home Creek provides |
|---|---|
| New game | The starting level: learn to read ground, dig, and pan |
| Standalone play | A complete, calm loop that can be played indefinitely |
| Bankruptcy | The guaranteed recovery location: free, always reachable, needs no consumables |
| Returning expert | Faster, better recovery, because the player's knowledge carries over |

It satisfies the anti-death-spiral rules directly. The creek cannot be leased, lost, or foreclosed. The shovel and pan cannot be seized, sold off, or broken. Nothing used here can run out.

### Site rules

- **No claim, fees, or staff.** It is informal public ground, and the work is the player's own.
- **Finite spots, renewing creek.** Each dig spot has real layered reserves and visibly runs out. High water redeposits a modest amount of surface gold, so the creek as a whole never goes permanently dry. In the game this happens two ways:
  - **Bit by bit:** each worked-out spot, gully test spots included, has about a 40% chance per game day of a small rise laying a thin fresh layer. A source gully gets colour again; a barren one next to none.
  - **The guarantee:** the moment every creek spot is worked out, a big high water refreshes every worked-out spot at once.
- **Modest but reliable.** Well-read ground pays steadily. The Home Creek should never out-earn a developed claim.
- **Uncertainty stays.** Ground signs raise the odds of a good spot, but only the pan confirms it.

### Reading the ground

Visible signs that tell the player where gold is likely to have settled:

- Inside bends and slow water downstream of obstructions.
- Bedrock exposed in the creek bed, especially its cracks and crevices.
- Black-sand streaks on gravel bars.
- Moss and roots on rocks at the high-water line, which trap fine gold.
- Boulders with gravel packed behind them.

### Shovel interaction

| Stage | Description |
|---|---|
| Setup | Choose a dig spot based on ground signs |
| Operation | Dig down through the bank. The cut face visibly shows the layers: overburden, gravel, the darker pay streak, bedrock |
| Interruption | Boulders that must be levered out, water seeping into the hole, or a small bank slump that buries the hole |
| Harvest | Reach bedrock and scrape its cracks: the richest material in the creek, and the shovel's reward moment |

The key decision is **where and how deep**. Topsoil is quick to dig but poor. The pay streak and bedrock are richer but cost time.

### Selling gold

Gold is sold at the assay office in town, reached from the creek. The buyer weighs the vial and pays spot price less a cut:

| Lot weight (fines and flakes) | Share of spot paid |
|---|---:|
| Under 100 mg | 70% |
| 100 mg to 1 g | 80% |
| 1 g and over | 88% |

Pickers sell whole as specimens at 1.5× spot. The spot price is a game price ($500 a gram), tuned so the Home Creek pays modestly but steadily. Careful panning through a whole spot averages about $1.70 a pan. Topsoil pays pennies and the pay streak and bedrock pay most, so digging down matters. The $40 sluice takes roughly 25 good pans.

The outfitter in town sells the first piece of real equipment, a **hand sluice for $40**: roughly 25 good pans. The outfitter also sells a **big concentrate jar for $10**, holding three times as much. Buying the sluice doesn't unlock anywhere to use it. It sets up only at a sluice site on a creek bend, and taking it down washes its moss into the concentrate jar so nothing it caught is lost.

The sliding rate creates a small decision: sell now, or keep panning to reach a better rate. Selling never costs anything, so it never blocks the recovery path. Black sand is not bought. It has to be panned to release its gold.

### Leaving the creek

The Home Creek is also how the player finds their next site. Leads point to further creek stretches: shovel-and-pan ground like the Home Creek, but finite. Only the Home Creek renews with high water. Leads come from three places:

- **Following colour upstream.** Dry side gullies join the creek. If one carries gold down from further up, spots just downstream of its mouth are richer, so panning along the creek shows a trail of colour. The player keeps field notes (pans and colour per spot) to read it. A test pan up the right gully that shows colour follows the trail to a new stretch. A barren gully pans empty. This lead is free, always real, and earned by reading the ground.

  On the creek map, each panned spot shows gold flecks by its stake, one to four for its colour per pan, so the trail can be read at a glance. Its tooltip gives the notes as a prospector would jot them: the number of pans, the colour in words (no colour, a few specks, poor, fair, good, rich), and whether it gets richer or thinner deeper down once both shallow (topsoil, gravel) and deep (pay streak, bedrock) ground has been panned. No milligram figures.
- **Clues while digging.** Now and then the shovel turns up an old pan, a survey stake, or a note in a tin. It points to a named stretch the player can follow later.
- **The claims board in town** (the Leads tab). Leads for sale, restocked every dozen pans:

| Source | Price | Reliability | Estimate |
|---|---:|---:|---|
| Rumour | $2–4 | ~55% real | Very wide, talked up |
| Old claim record | $8–12 | ~85% real | Moderate |
| Map fragment | $15–25 | ~95% real | Narrow |

About a third of stretches are **creek bends**: one or two spots with steady water, a usable drop, and room on the bank for a sluice. Leads say what they think the ground is (see "In the game: site kinds"); better sources are right more often, but can still be wrong. Whether a sluice can be set is a property of the ground: the Home Creek never has a sluice site, and owning a sluice doesn't create one.

On the region map the river winds across the middle, with the town on its bank and the Home Creek just upstream. Found stretches are tributaries spread out around them, on both banks and both sides of town, each a little further out than the last. A stretch's place comes from its id and the order found, so the map never shifts when a new stretch turns up. The map opens fitted to everything found, and can be zoomed (mouse wheel, pinch, the + and − keys, or the buttons) and dragged; names that would collide are left off until zoomed in, except the stretch the player is at, the Home Creek and the town. The map sets no limit on stretches; claim holding costs are meant to keep the count sensible.

Every lead states a richness range relative to the Home Creek. It is an estimate, never the truth, and a dud still states one. Following a lead either puts a new stretch on the region map or marks the lead as a dud. Found stretches can have gullies of their own, so leads can chain further out. The player leaves when they choose to, not because the creek forced them out.

### Returning after bankruptcy

The player returns with nothing but the shovel, the pan, and what they know. The creek remembers which spots were worked and which have been refilled by high water. An experienced player recognises good ground faster, pans with less loss, and follows colour to a new lead sooner than a new player could.

---

## Staffing System

Staffing is the transition from being a prospector who works one spot to an operator who can keep the present running while personally finding the future.

### Operating modes

| Mode | Player presence | Cost | Output | Main use |
|---|---:|---:|---:|---|
| Self-run | Required | Lowest | Highest control and player skill benefit | Early game, testing, recovery |
| Crew-run | Optional | Wages and supplies | Steady but imperfect | Keep proven claims active while prospecting |
| Managed | Not required | High wage and management overhead | Scalable, largely autonomous | Multi-claim late-game operations |

The core question is:

> Does the player personally mine known ground for reliable immediate income, or pay staff to do that while they search for a potentially better future claim?

### Staff roles

| Role | Main job | Enables | Main downside |
|---|---|---|---|
| General hand | Pans, shovels, sorts, hauls | Basic unattended work | Slow and limited to simple gear |
| Equipment operator | Runs processing equipment | Higher throughput and larger tools | Wage, fuel use, breakdown risk |
| Prospector | Searches local terrain and gathers samples | New leads and local discoveries | Weak leads remain possible |
| Surveyor or geologist | Samples, maps, estimates reserves | Better forecasts and earlier depletion warning | Upfront cost, limited immediate revenue |
| Mechanic | Maintains pumps, generators, belts, vehicles | Less downtime and lower repair cost | Not valuable at tiny manual sites |
| Foreman | Coordinates crew and site policy | Lower unattended penalty, higher reliability | Expensive; needs a larger operation |
| Logistics worker | Moves supplies and material | Prevents supply failures and lowers transport friction | Needs storage and access |
| Environmental or safety specialist | Manages water, reclamation, risks | Fewer shutdowns, accidents, fines, reputation losses | More valuable at large/sensitive sites |

### Staff capacity by site scale

| Site scale | Maximum staff | Typical staffing | Operational ceiling |
|---|---:|---|---|
| Creek or micro-claim | 0–1 | Player, or one general hand | Manual panning, small sluice, sampling |
| Small claim | 1–2 | General hand plus operator | Portable processing and basic camp |
| Medium claim | 3–5 | Operator, hand, mechanic, prospector or surveyor | Highbanker/trommel and limited logistics |
| Large claim | 6–10 | Full crew, foreman, specialists | Wash plant, multiple work areas, heavy support |
| District operation | 10+ across claims | Foremen and mobile specialists | Several claims and regional logistics |

### Player efficiency versus staff efficiency

The player should usually be most efficient on site. Staff create time freedom, not immediate replacement value.

| Claim state | Player operating | Worker alone | Worker with foreman |
|---|---:|---:|---:|
| New, poorly surveyed site | 100% expected output | 55% | Usually unavailable or inefficient |
| Stable medium claim | 100% | 70% | 85% |
| Mature, mapped large claim | 100% | 75% | 92% |
| Near depletion | 100% with judgment | 35% due to waste | 65% with good reserve data |

The player still has reasons to visit staffed sites:

- Verify a newly discovered deposit.
- Solve a breakdown or safety issue.
- Adjust extraction policy.
- Choose a deeper layer or new work zone.
- Decide whether to continue, relocate, or close.
- Negotiate, inspect, or manage a special event.

### Staff traits

Keep traits compact and useful:

- Skill specialty.
- Reliability.
- Caution.
- Initiative.
- Loyalty.
- Wage expectation.
- Site preference, such as remote work, machinery, manual work, large crews, or safer sites.

A low-wage novice can be more expensive than a veteran if their mistakes waste material, cause breakdowns, or create downtime.

### Crew policies

Avoid per-worker micromanagement. Assign a site-level policy:

- Extract efficiently.
- Extract aggressively.
- Conserve the claim.
- Maintain and prepare.
- Survey extension.
- Close and reclaim.

Show the player:

- Expected daily gross revenue.
- Expected daily net income.
- Wage, fuel, and supply costs.
- Reserve depletion rate.
- Remaining supply days.
- Accident, maintenance, and shutdown risk.
- Supervision requirement.
- Plain-language profitability warning.

Example warning:

> At current staffing and feed rate, this claim is likely to become unprofitable within approximately six work cycles.

---

### In the game: the crew

- **Hiring, by role:** the crew is hired in town (the Claims & crew tab), first day up front, as many as the player can pay. They wait in town until sent to a stretch.
  - **Who's looking for work:** four people turn up in town each game day, each with a role, a skill and a pace, and asking a wage that goes with their skill.
  - **Skill** (green, fair, seasoned) is how much gold they lose: a lighter tip on the pan, truer water on the sluice, trouble seen sooner, cleanouts on time. Measured on a bend with two operators, green keeps about 8% less than fair and seasoned about 7% more. Green asks three quarters of the going wage and seasoned a fifth more, so a cheap green hand can cost more than they save.
  - **Pace** (slow, steady, quick) is how fast they get through the work: about 20% slower or 15% quicker. More ground a day, and the ground runs out sooner.
  - **Foremen ($35 a day)** take no job and no digging room, one to a stretch. They lift the whole crew's skill as far as the player's field notes cover the ground there, and send the diggers where the notes say the colour is. On fully sampled ground a crew brings in about 18% more under one; on ground nobody has sampled, nothing (see the player-versus-staff table: a foreman needs good reserve data). The tablet warns when a foreman has no notes to work from.
  - **Hands ($12 a day):** pan, rock, haul, screen loads, prospect and finish concentrate.
  - **Operators ($25 a day):** also run the sluice, highbanker, trommel and drywasher.
  - Measured on typical ground, an operator on a sluice or highbanker brings in roughly three times their wage while the ground lasts, and a hand panning or rocking a little over theirs.
- **Placing:** each stretch takes as many hands as the ground has room and work for: two on a creek stretch, bend or ravine, three on a dry wash, four on a gravel bar, never any at the Home Creek. Hands can be called back to town and sent elsewhere.
- **Jobs, set per site, not per worker:** the player switches on the work they want at each stretch, and the crew there fills them in the order they were switched on. An operator job waits for a free operator. Any other job takes a hand first, and a spare operator if no hand is free. Only jobs the ground can take are offered.
  - **Sluice and highbanker:** the player's own if it's set up at that stretch, otherwise a crew unit.
  - **Rocker and drywasher:** crew units.
  - **Pan:** by hand. Visible gold goes in the crew's poke, and black sand with its hidden fines in the crew bucket.
  - **Screen loads:** a crew classifier. No rocks reach the machines, and pickers wedged in them go in the poke.
  - **Haul:** everyone else's carrying and water-fetching takes about 70% of the time.
  - **Prospect:** test-pans the stretch's gullies, following a source gully to a new staked stretch, then roams and turns up leads now and then.
  - **Finish concentrate:** pans the crew bucket down into the poke at a hand's recovery. This is the one job that gives up the player's reveal, and it's the player's choice.
- **Policy, one per stretch** (set in the Claims & crew tab, shown on the tablet): how the whole crew there works, never orders per worker. Each changes how they drive the same machines, so each costs something. Measured on a bend with a sluice and a pan:
  - **Steady** (the default): their usual pace and care.
  - **Careful** (conserve the claim): slower feeding, gentler water, a lighter tip, cleanouts and fixes sooner. About 20% less ground a day, with about half the sluice loss: roughly 10% less gold a day, but more gold from every shovelful.
  - **Push hard** (extract aggressively): quicker feeding, harder water, a heavier tip, cleanouts and fixes put off. About 20% more ground a day at about a third lost: a little more gold a day while the ground lasts, and the ground goes faster.
  - **Prepare the ground** (maintain and prepare): no washing. The diggers strip topsoil and slumped bank, pry boulders and bail holes, then report the ground ready, so the player arrives to open pay gravel. The tablet says when there's nothing left to clear.
  - At abandoned diggings the crew washes the old tailings rather than tossing them as topsoil.
- **The crew in town:** the assay office has a settling tub. The player can pour the jar into it ("Leave the jar's black sand in the tub"), and couriers bring in what claim crews make. Up to two hands or operators can be stationed there (no foremen, no supplies, no fee), on two jobs and a policy:
  - **Magnet the tub:** the same magnet the player uses, swept at the policy's closeness: careful holds it high and shakes the clump back (slow, little gold lost), push hard holds it right down and strips without shaking back (quick, fine gold goes with the magnetite).
  - **Finish concentrate:** finishing pans at the trough, at a hand's recovery.
  - Gold they find waits at the counter; "Collect from the counter" (W in town) tips it into the vial, and the tablet lists it under Needs you.
- **Couriers ("Run to town", at a claim):** once the crew bucket holds about half a bucket, or the poke has anything in it, a hand loads it all and walks it to town (a minute of game time each way, plus the stretch's walk in), pours the concentrate into the settling tub, hands the poke in at the counter, and walks back. The claim's bucket never fills while a courier runs, and the town crew always has concentrate to work. With both, the whole chain runs without the player: dig and wash at the claim, carry to town, magnet and pan, gold at the counter, each step at a crew's recovery.
- **Machines:** crew units are bought at the outfitter (crew sluice $40, highbanker $90, trommel $220, rocker box $20, drywasher $45, classifier $15) and wait as spares until a switched-on job needs one. Switching a job off sends its unit back to spare, washing what it held into the crew bucket. Crew engines burn the player's fuel cans.
- **How they work:** every job drives the same simulation the player does, slower and less attentive: digging from the nearest ground, tossing topsoil, feeding cautiously, raking and clearing late, cleaning out on a schedule, panning with a heavier tip. A hand on the sluice keeps roughly half what the player would in the same time. Crews work only while the player is at another stretch, and stand back while the player works theirs.
- **What they make:** each stretch's crew bucket (concentrate, about five mats) and poke (gold) wait for the player. "Collect from the crew" at the stretch puts the poke in the vial and as much of the bucket as fits in the jar. On arrival the player hears who worked, for how long, and what they did.
- **Wages** run by the day for every hand, working or not, and are paid in town with claim fees, automatically while there's cash. If the crew goes more than two days' wages unpaid, the last hand hired walks off, and what's owed stays owed. Releasing a claim brings its crew back to town with their bucket and poke.
- **Estimates:** the claim's entry shows how many days of ground are left at the crew's pace, and a rough daily take for a hand built only from the player's own field notes.
- **Field tablet:** the player's central place for information, always to hand on a creek, the region map and in town, crew or no crew. The clock and cash in the corner are drawn as the tablet itself: tap it (or press O) to open it, and its light turns red when the books or a claim need the player. It only reads; buying, hiring and setting jobs still happen in town. Game time stands still while it's open.
  - **Messages** arrive on the tablet: each one drops out from under it and its light blinks, and the last few are kept on the Overview.
  - **Getting started:** until they're all done, the Overview opens with the early game's first steps: pan some colour, sell it in town, save black sand, find a lead, stake a new stretch, buy a machine, hire a crew. Each ticks the first time it happens and stays ticked (it's kept in the save); the next one shows how. A message marks each as it's done and names the next. It's a guide, never a gate: nothing is locked behind it.
  - **Overview:** where the player is, cash, the vial (weight and what the buyer would pay), the jar (how full; its gold unknown until panned), gear owned and where machines are set up, claims, crew, leads, and a "Needs you" list gathered from everything below.
  - **Claims:** a card for each held claim, sorted by what needs attention: Trouble (lapsed, crew idle on wages, no jobs, or likely costing more than it brings in by the player's own notes), Needs a look (bucket nearly full, out of fuel, waiting for a crew unit or an operator, fees owed, ground nearly worked out, no field notes), Steady, and No crew. The Home Creek is always listed: free, always yours. Tapping a card shows the crew, each job's state, costs a day, ground left, the rough take, what's waiting to collect, and a "Walk there" button.
  - **What waiting shows:** how full the crew bucket is, and pieces in the poke. Gold still in the bucket's concentrate is never counted: it's unknown until panned.
  - **Crew:** who is at each stretch, their wages, jobs left unfilled, who is waiting in town, and spare crew gear; with nobody hired, what hiring would get you.
  - **Leads:** the notebook (on the region map, drawn as a paper field book: leads pencilled in, duds struck out, finds circled; only leads still to follow are shown, with followed and dud leads folded away as "old leads" at the back), read-only here, and how many leads are for sale in town.
  - **Costs:** cash, fees and wages a day, how long cash lasts at that rate, what's owed, and the financial state with the countdown to shutdown when insolvent.
  - Not yet: accident risk (not modelled), and setting crew policy from the tablet (see "Crew policies"). Machine wear shows on each claim's sheet.
- **Town, on paper:** in town the side panel is the counter. The outfitter's wares carry manila price tags that are also the buy buttons (saying what's short, or why not), with a red stamp on gear the player owns; leads for sale are pinned index cards; and the claims office opens on a ledger page of every claim's fee a day and what it owes, the payroll, and the total.

## Equipment UX Philosophy

Every piece of equipment is a distinct visual interaction, not a generic timer or a passive production multiplier.

### Universal machine lifecycle

Each machine should have four stages:

1. **Setup:** Place it, configure it, and connect required inputs such as water, fuel, power, or material containers.
2. **Operation:** Watch material visibly enter, change, and exit while monitoring one key operating condition.
3. **Interruption:** Handle a machine-specific friction point such as a clog, jam, full mat, low water, low fuel, overheating, or broken belt.
4. **Harvest:** Perform a satisfying final action such as cleanout, unloading, sample inspection, concentrate separation, or equipment teardown.

### Design test for every tool

For each piece of gear, answer:

1. What can the player see moving?
2. What can visibly go wrong?
3. What decision does the player make during operation?
4. What satisfying action ends the cycle?

### Gear interaction matrix

| Gear | Player verb | Visual loop | Meaningful choice |
|---|---|---|---|
| Gold pan | Shake and tilt | Each shake throws water toward the lip; light sand spills; black sand and flakes remain | Wash speed versus retaining potential value |
| Classifier | Shake and sort | Oversize rocks bounce away; sized material falls through | Screen size versus speed and suitability |
| Shovel and bucket | Dig and carry | Ground lowers; bucket fills; pay dirt moves to processing | Which patch or depth deserves time |
| Sluice | Feed, tune, clean out | Water flows; gravel enters; tailings exit; moss gathers concentrate | Flow, slope, feed rate, cleanout timing |
| Rocker box | Rock | Material advances with limited water | Rhythm and water conservation |
| Highbanker | Prime, feed, monitor | Pump pushes water uphill; hopper vibrates; material moves to sluice | Fuel, water, feed rate, clog prevention |
| Drywasher | Pulse and separate | Air and dust move through riffles; concentrate remains | Airflow, dust buildup, feed consistency |
| Trommel | Load and maintain | Drum rotates; oversize rock separates; fines reach recovery deck | Throughput versus jamming and wear |
| Crusher | Break and grade | Ore enters; rock fractures; graded material exits | Energy use versus fineness and stress |
| Metal detector | Sweep and pinpoint | Signal changes over targets; player chooses where to dig | Search time versus moving onward |
| Drill rig | Position and core | Drill descends; cores emerge; geological layers become visible | Information value versus cost |

---

## Pan UX Specification

The pan is the first tool the player touches and the last one they can lose. It must be deep enough to carry the standalone Home Creek on its own, and it is held to the same standard as the sluice.

### Core fantasy

The player crouches at the water's edge with a pan of raw creek gravel. They shake it level to break up the clay and let the heavy material sink, pick out the rocks, then tip it toward the lip and keep shaking so the light sand washes over. The pan's contents shrink down to a streak of black sand, and a last slow turn shows whether there is gold in it.

### Pan material flow

```text
Shovel load of gravel
→ submerge, then shake level: clay breaks up, heavies sink (stratify)
→ rake off and inspect large rocks
→ tip toward the lip and keep shaking; light material washes over (nothing washes until the clay is gone)
→ black-sand concentrate
→ final reveal
→ pick flakes and pickers into the vial; save black sand to the concentrate jar
```

### Persistent visual indicators

- **Water clarity:** Muddy water means clay or fines remain unbroken; clear water means the load is working.
- **Material layering:** Pale sand on top, darker material settling toward the bottom and the riffles.
- **Lip spill:** What is going over the edge. Pale sand is fine. A dark streak means black sand, and possibly gold, is being lost.
- **Glints:** Brief flashes while shaking that hint at gold but never confirm the amount.
- **Pan fill:** The pile visibly shrinks from a full load to a thin concentrate.

### Operating states

| State | Visual signal | Mechanical result | Player response |
|---|---|---|---|
| Timid | Water stays cloudy; material barely moves; little spills over the lip | Very slow; nothing is lost but little is done | Tip it further |
| Balanced | Light sand sheets off the lip; dark layer stays put | Good speed with minimal loss | Continue |
| Aggressive | Dark streaks go over the lip; the pan empties quickly | Fast, but fine gold and black sand are lost | Level the pan and re-stratify |

**Sand grain varies from pan to pan,** so no single remembered tilt is right for every pan:
- **The range:** each shovelful's sand runs from fine silt to coarse grit, typical of its layer (topsoil fine, gravel coarse, pay streak in between, crushed bedrock coarse-ish) and varying shovelful to shovelful.
- **Fine silt** washes about 30% faster but lets the heavies go at a shallower tip. **Coarse grit** holds at a steeper tip but washes slower.
- **So "balanced" moves:** the balanced tilt shifts by roughly ±30%, and the player reads it from the pan. The grains are drawn smaller and paler or chunkier and tanner, the inspection panel names the sand, and the "gold over the lip" nudge on a fine pan says why.
- **Exceptions:** concentrate from the jar and screened material from the classifier are medium.

Shaking does both jobs. Held level, it breaks up the clay and settles the heavies; tipped, it washes. Washing churns the layers back together, and the steeper the tip, the more it churns. The skill is finding how far to tip: a moderate tip washes quickly and stays settled, while a steep one outruns the settling and sends gold over the lip.

### Key player controls

- Sift (shake the pan): hold the pan, Space, or the Sift button. Once the sand left reads 0% there is nothing more to sift, so sifting stops, and nothing more can wash out. After the reveal, Sift and Tilt go away until the next pan.
- Tilt: how far the pan is tipped toward the lip. Level to settle, tipped to wash.
- When to stop and reveal.

### Interruptions

- **Clay:** Clay holds the gravel together, so nothing washes out until it is broken up. The player shakes the pan level until the water clears.
- **Oversize rocks:** Large rocks need to be raked out, and each one inspected before it is thrown away. There is a small chance of a nugget stuck to one.
- **Poor panning water:** Shallow or muddy water makes stratification slower and the pan harder to read. The player can move to a better spot on the bank.

### Harvest: the reveal

1. Work the pan down to black sand.
2. Hold it level and give it one slow turn to fan the concentrate out.
3. Reveal: no colour, a few specks, a tail of flakes, or a picker.
4. Pick visible gold into the vial by finger, or wet the fingertip to lift fine flakes.
5. Choose whether to save the black sand to the concentrate jar or dump it.

The concentrate jar is the tailings layer at the smallest scale. Saved black sand still holds fine gold that can be re-panned later, and it becomes worth more once better finishing equipment is available.

The jar has a real limit: about fifteen pans' black sand, or one sluice cleanout. A full jar refuses more rather than spilling it, so nothing is ever lost to it. Saving is refused, lifting a sluice mat waits, and the sluice can't come down, until some of the jar is panned. The standard jar always holds a full sluice mat, so a cleanout can always finish once the jar is emptied.

Panning the jar is delicate. Black sand is nearly as heavy as fine gold, so the safe tip is shallower than for gravel. The game warns when gold is going over the lip. A jar pan worked all the way down leaves only spent residue, which is tipped out rather than saved. A jar pan revealed early puts its unfinished black sand back, with any gold still hidden in it. The jar can be panned at any water, and in town at the wash trough behind the assay office, so a jar full from the claims can be finished and sold in one stop. Time doesn't pass for it there, as with everything in town.

### Compact inspection panel

| Readout | Purpose |
|---|---|
| Loss estimate | Rough indication of material lost over the lip this pan |
| Pans worked | Session count, for comparing spots |
| Colour per pan | Running average for the current dig spot, approximate |
| Vial contents | Recovered gold, shown physically first, weight second |

---

### In the game: the first pan

A new player's first pan or two come with a small walkthrough card beside the pan, one step at a time, each shown once the last is done: settle it level until the water clears, tip and wash, keep washing (tip back if heavies go over), reveal, collect and save the black sand. It shows Sand left while washing and flags when heavies are going over the lip. It can be skipped, and it stops after the second pan. While it's up, the pan coach keeps only its warnings (gold over the lip, overworking); the card does the teaching. On a short screen it shows just the step at hand.

## Sluice UX Specification

The sluice is the reference interaction for the rest of the equipment chain: readable, physical, satisfying, and strategically meaningful.

### Core fantasy

The player sees water run over riffles and miner's moss. Gravel and sediment enter at the top. Lighter material washes out as tailings. Heavy black sand and gold-bearing concentrate build up in capture zones. The player decides when to stop the run and clean out the miner's moss.

### Sluice material flow

```text
Water source
→ intake / header
→ slick plate
→ riffles + miner's moss
→ tailings exit

Gravel and sediment enter at the top.
Light material washes through.
Dense concentrate builds behind riffles and inside the mat.
```

### Persistent visual indicators

Show the machine itself communicating its state:

- **Water flow:** Animated water depth and speed.
- **Feed material:** Gravel, pebbles, and dark sediment entering the box.
- **Riffle behavior:** Small eddies and temporary material settling behind riffles.
- **Miner's-moss state:** Mat darkens as black-sand concentrate loads; occasional gold glints appear.
- **Tailings:** Pale sand and spent gravel leave the end of the sluice.
- **Machine condition:** Splashes, uneven flow, backing material, or visible loss communicate problems before a text warning does.

### Operating states

| State | Visual signal | Mechanical result | Player response |
|---|---|---|---|
| Underpowered | Thin trickle; gravel piles near intake; tailings barely move | Low throughput and clog risk | Increase flow, reduce feed, reposition |
| Balanced | Smooth water sheet; steady movement; visible riffle eddies | Strong recovery and throughput | Continue operating |
| Overpowered | Whitewater; excessive splashing; material shoots through too quickly | Higher throughput but fine material is lost | Reduce water, slope, or feed rate |

### Key player controls

- Water flow.
- Sluice slope.
- Material feed rate.
- Material classification quality.
- Timing of cleanout.

### Miner’s-moss cleanout

The miner's moss is not just a storage bar. It is a physical container of uncertain concentrate.

Cleanout choices:

- **Early cleanout:** Safer recovery, less accumulated concentrate, more interruptions.
- **Normal cleanout:** Best balance of recovery and uptime.
- **Late cleanout:** More throughput before stopping, but reduced recovery and more difficult cleanup.
- **Emergency cleanout:** Caused by flood, clog, overfeeding, or equipment failure; more chaotic and potentially wasteful.

Cleanout sequence:

1. Stop feeding gravel.
2. Let clean water rinse the sluice briefly.
3. Lift out the miner's moss, visibly heavy with dark concentrate.
4. Place the mat in a cleanup tray or bucket.
5. Pan or finish-process the concentrate.
6. Reveal the actual gold recovered.

The delayed reveal creates anticipation and prevents the interaction from feeling like a simple capacity meter.

### Compact inspection panel

The world view should be primary. An optional inspection panel can provide optimization data:

| Readout | Purpose |
|---|---|
| Water flow | Indicates underpowered, balanced, or excessive flow |
| Feed rate | Indicates whether the box is overloaded |
| Recovery estimate | Approximate, especially early in the game |
| Moss loading | Indicates cleanout urgency |
| Tailings loss | Shows likely loss of fine material |
| Run duration | Helps compare setups and locations |

Early game values should remain approximate. Better equipment, trained operators, sensors, and foremen can improve confidence without removing all uncertainty.

---

### In the game

- **Setting up:** a bought sluice sets up only at a sluice site on a creek bend, in the creek beside a dig spot. Moving it or taking it down washes its moss into the concentrate jar.
- **Feeding:** shovelfuls go straight from the hole into the header. Feed rate is simply how fast the player shovels, and a brim-full or jammed header refuses more.
- **Water:** a Water slider sets the intake. Each site's slope and flow decide what power that gives, so the balanced setting differs from site to site.
- **Reading it:** the bank view shows a small sluice for reading at a glance. The close-up shows the header heap, the water sheet, eddies, whitewater, moss darkening, tailings and escaping gold. The inspection panel reports only in words (fresh, loading, heavy, full), never numbers.
- **Clogs:** tapping the header rakes a clog. Raking out a full jam costs a little of the moss.
- **Cleanout:** "Clean out" stops feeding while clean water rinses the riffles. The player chooses when to lift the mat: early brings more gravel to pan, late strips fines. The mat washes into the concentrate jar, and panning the jar gives the delayed reveal.
- **When it runs:** the sluice only runs while the player is at its spot.
- **Slope:** each site has its own drop. Below about 0.3 the box is **too shallow**: gravel piles on the riffles and packs them. Above about 0.75 it is **too steep**: material shoots through before the heavies settle, costing fines and black sand. The close-up tilts the box to match.
- **Upgrades** (outfitter, each fits only a sluice already owned):
  - **Riffle insert and ribbed mat ($25):** catches more fine gold and loses less to scour. No new control; the difference shows at cleanout.
  - **Adjustable legs ($12):** a Slope slider, reaching up to 0.4 either side of the site's own drop. The close-up shows screw legs.
  - **Recirculating pump ($60):** some stretches that aren't bends have a thin-water bench, with room and a drop but only a trickle of creek. A sluice sets up there only with a pump. The pump feeds the header from a settling pool while its tank has fuel. A can ($2, carry up to six) fills the tank for about two minutes of running, less with the intake wide open. When the tank runs dry mid-run, the engine stops puffing, the water falls back to a trickle, and the header backs up until the player refuels. Owning a pump creates no site, and it does nothing at a strong creek.

## Material Chains

Material should remain visually and mechanically identifiable through processing. Avoid abstract conversions such as Resource A becoming Resource B.

### Creek chain

```text
Diggable creek bank
→ shovel and bucket
→ classifier
→ sluice
→ miner's-moss cleanout
→ cleanup pan
→ flakes, pickers, nuggets, or concentrate
```

Questions answered at each step:

- Where is the pay dirt?
- Is the material appropriately sized?
- Is water flow separating it effectively?
- Is enough concentrate in the mat to justify cleanout?
- What value was actually recovered?

In the game, the **hand classifier** ($15 at the outfitter) is a screen sitting on a bucket:
- **Screening:** a shovelful goes on the screen, and holding Sift shakes it through. Sized material rains into the bucket; rocks stay on top.
- **Rocks:** tapping a rock picks it off and checks it for a wedged picker. Tipping the oversize off unexamined sends any pickers with it, and the game never says whether there were any.
- **Screens:** the coarse screen is fast. The fine screen also holds back pebbles, so less volume reaches the bucket for the same gold, but it passes slowly, and the oversize blinds the mesh.
- **The bucket:** it holds about three shovelfuls. It pours into the sluice header, where there are no rocks to jam the intake or carry pickers off the end, or into the pan a pan-sized share at a time, with no rocks to rake.
- **Where it works:** every found stretch, but never the Home Creek, which stays shovel-and-pan only.

In the game, the **rocker box** ($20 at the outfitter) is the step between the pan and the sluice. It needs no sluice site, only water carried in a bucket:
- **Where it works:** every found stretch, never the Home Creek. It travels with the player, and stands on the bank behind the pan.
- **Feeding:** shovelfuls go on the hopper screen (or the classifier's bucket is poured in). Rocks stay on the screen to be tipped off, pickers and all, unannounced.
- **Water:** a bucket holds ten ladles. Each ladle raises the water in the box, and each stroke carries some out of the end. Fetching a bucket takes a few seconds beside steady water (a creek bend) and more than twice as long where the creek runs thin, so water is worth conserving.
- **Rhythm:** each tap of Rock is one stroke, and the time between strokes is the rhythm. A steady beat (about 0.6 to 1.5 s) moves material and keeps recovery strong.
- **Operating states:** **stalled** (a dry box, or strokes far apart: nothing moves, clay never breaks up), **rocking steady**, and **sloshing** (strokes too quick, which throws gold out the end, or a flooded box, which pours over the sides and strips fines out of the apron).
- **Harvest:** the canvas apron darkens as it loads and catches less when heavy, like the sluice's moss. "Clean up the apron" washes it into the jar for the delayed reveal.
- **Throughput:** well above the pan, below the sluice.

In the game, the **highbanker** ($90) is the first motorized machine: a sluice box on a stand on the bank, fed by a hopper with a grizzly and a spray bar, watered by a small gas engine and pump drawing from the creek:
- **Where it sets up:** it needs strong water to pump from and room for the stand. That means a creek bend, a gravel bar, or a ravine (the compact one), beside any dig spot. Never a plain stretch, a dry wash, or the Home Creek, and never at the same spot as the hand sluice. Moving it washes its mat into the jar, and the engine keeps whatever fuel is in its tank.
- **Setup:** prime the pump (a couple of seconds), then start the engine.
- **Operation:** the throttle is the sluice's water, so the underpowered / balanced / overpowered states apply, and it also sets fuel burn and engine heat. The box is larger than the hand sluice's (water carries more through it, and its header holds more), but the mat is the standard size, so the standard jar always holds one. The hopper takes shovelfuls straight from the hole (or the classifier's bucket) and meters them down so the header never backs up. Rocks roll off the end of the grizzly, taking any wedged pickers with them, unannounced.
- **Interruptions:**
  - The hose can shift and suck air, more often at high throttle: the pump loses prime, the spray stops, and bubbles show at the intake. It has to be primed again.
  - An engine run dry, or hard for long, heats up, glows and steams, and stalls at full heat. It won't restart until it has cooled.
  - A rock can jam across the grizzly and stop the hopper until it's cleared.
  - The tank runs dry. It runs on the same $2 cans as the recirculating pump.
- **Harvest:** the same cleanout as the sluice. The hopper holds back while clean water rinses the riffles, then the mat is lifted into the jar. The riffle insert applies to it too.
- **Floods:** a flood on a gravel bar sweeps its hopper, strips its mat, and knocks the pump out of prime.
- **Throughput:** it moves at least a quarter more gravel than a hand sluice fed at a brisk pace (over 120 shovelfuls in four minutes of play, against about 96), recovering well over half the gold fed.

In the game, the **trommel** ($180, crew unit $220) is the first large-site machine: a rotating screen drum on a frame, a spray bar through it, and a wide riffled recovery deck underneath, all run by one small engine. It eats rocky, clayey gravel that would jam a highbanker, and a lot of it.
- **Where it sets up:** gravel bars only, beside any dig spot (never a gully, never sharing a spot with the sluice or highbanker). It needs a wide, level bar and a big pile to feed it.
- **Material flow:** shovelfuls into the hopper → the drum tumbles them under the spray, breaking up clay → fines fall through the screen onto the deck → rocks and surviving clay balls roll out the far end onto the oversize pile (which grows, visibly). Gold still bound in unbroken clay stays in the drum until the clay breaks, or rolls out with it.
- **Controls:** the Drum (speed) and the Spray (the deck's water, so the underpowered / balanced / overpowered states apply). The drum reads as **crawling** (too slow: clay balls roll out whole with their gold, little screens through), **tumbling** (the working speed: the load cascades and breaks up), or **racing** (too fast: the load rides round the wall and is flung out the end, fines and gold with it, and the drum wears faster). Measured on rocky, clayey gravel with regular cleanouts: tumbling keeps about two thirds of the gold on the deck with under a tenth out the end; crawling or racing loses far more out the end.
- **Interruptions:** overfeed it and the drum jams solid and stops; clearing it turns the whole load out onto the pile, gold and all, so the feed rate is the choice. The deck's header backs up if fed faster than the water can carry, and the drum stops screening. The tank runs dry ($2 cans), and the engine and drum wear (repair kits).
- **Harvest:** stop, rinse the deck, lift the mat into the jar, as with the other boxes. Its bigger deck carries more moss (moss capacity scales with box size), so it goes longer between cleanouts.
- **Floods:** high water sweeps the hopper and drum and strips the deck.
- **Crew:** an operator job ("Trommel") on a crew unit or the player's own: turns the drum at a tumble (a little quicker pushing hard), feeds without heaping the hopper, bars jams loose a little late, cleans out into the crew bucket, and burns the player's fuel cans.

### Dry-wash chain

```text
Dry gravel
→ screen
→ drywasher hopper
→ airflow and riffle separation
→ concentrate drawer
→ finishing pan or table
→ recovered gold
```

Distinct visual identity:

- Dust clouds.
- Pulsing bellows or fan noise.
- No natural flowing water.
- Airflow tuning.
- Feed consistency and dust buildup.

In the game, the **drywasher** ($45) is a hand-bellows machine for dry washes only. It uses no water and no fuel:
- **Where it works:** it travels with the player and stands on the bank behind the classifier.
- **Feeding:** shovelfuls go on its screen (or the classifier's bucket is poured in). Fines drop onto a sloped riffle tray with a cloth bottom, and rocks stay on the screen to be tipped off, pickers and all.
- **Controls:** holding Pump works the bellows, reusing the pan's Sift control. The Air slider sets the air gate, reusing the pan's Tilt.
- **Operating states:** **still** (not pumping: nothing moves), **underblown** (the bed never loosens, heavies don't separate, the drawer fills with plain sand, and gold rides off with the mass), **balanced**, and **overblown** (fine gold goes up with the dust). The tray throws brown dust clouds that rise higher with more air.
- **Interruptions:** dust from dry clay and silt builds up in the cloth and chokes the air, so a good air setting drifts into underblown until the cloth is shaken out (which loses a few fines). Dry clay lumps blind the screen and slow it until it's knocked clear. The cloth greys and the screen goes pale, so both read at a glance.
- **Harvest:** pull the concentrate drawer into the jar. Pan it in a wash tub on the spot, or back at a creek. (True dry-panning is left for later.)

### Hard-rock chain

```text
Ore vein
→ drill, blast, or excavation
→ haul cart
→ crusher
→ mill or sorter
→ concentration table
→ refined concentrate
```

Distinct visual identity:

- Vibration.
- Belts and rotating drums.
- Power demand.
- Machine heat and wear.
- Storage hoppers and transport.

---

## Progression Through Mastery

Progression should add more capability and better information, not erase the identity of the underlying tools.

Example sluice progression:

1. Starter sluice: learn flow and feed control. *(in the game)*
2. Better classifier: fewer jams and more consistent material size. *(the hand classifier is in the game)*
3. Improved miner's moss or riffle insert: better fine-material capture. *(in the game)*
4. Adjustable legs: reliable slope control at imperfect sites. *(in the game)*
5. Recirculating pump: allows operation away from a naturally strong creek, at fuel and maintenance cost. *(in the game: fuel, and the sluice it feeds wears like any other)*
6. Highbanker hopper: increases material movement but introduces hoses, pump management, and clog risk.
7. Worker operation: staff can run the system at reduced efficiency while the player prospects.
8. Instrumented setup: improved reporting and estimates, while retaining site-specific risks.

Pan progression:

0. Steel pan: settle, tip, wash, reveal. The skill is how far to tip. *(in the game)*
1. Riffled pan: moulded riffles on one side of the wall hold the dark layer, so the player can wash harder. The riffles also hold black sand, so the player flips to the smooth side for the final cleanup; when to flip is the decision. *Open question: whether it may be used at the Home Creek. It is still the pan, and can never be lost or run out, but the Home Creek takes no added gear.*
2. Hand classifier: screened material, no rocks to rake. *(in the game)*
3. Magnet: pulls magnetite out of saved black sand, so the jar holds more and jar pans go faster. A little fine gold clings to the magnetite, so stripping hard costs gold. *(in the game: $6. About 60% of saved black sand is magnetite. The jar is spread in a tray and the player holds Pass to sweep the magnet at a chosen closeness: close strips fast but lifts fines into the clump, high is slow and clean. Each pass lifts less as the magnetite runs low. The clump holds a little before it must be dealt with: shake it back (most trapped gold and some sand drop back) and strip it onto the discard pile, gold and all, unannounced. Used in town or on a found stretch, never the Home Creek bank.)*
4. Finishing pan and snuffer bottle: a small, deep-riffled pan for jar work, and a bottle that sucks up the thin tail of fines at the reveal instead of saving it back to the jar. The trade is a slower reveal for gold in hand now. *(in the game: $8 and $4, used in town and on found stretches, never the Home Creek, as with the magnet. The finishing pan is used automatically for jar pans there: a little shallower safe tip, but its riffles hold the fines when it's tipped too far (at a too-steep tip it loses under half what the steel pan does), and it works the sand to a thinner tail that hides about half as much at the reveal. Being small it washes about a third slower: it costs time, not gold. The snuffer works at the reveal of any pan: the black sand lies in a comet tail, heavy pieces at the head and fines strung behind, and the player taps along it (or F works down it) to draw specks into the bottle. The thinner the tail was worked, the more each draw catches; a thick tail gives up fewer specks and more sand. Past a little sand the bottle clouds: its specks can't be picked clean and go back to the jar. A clear bottle tips into the vial. It never says how much is left in the tail.)*
5. Wash tub: panning where there is no creek (dry washes, benches). The player carries the water, and it clouds with every pan. Muddy water slows settling and hides colour until it is changed. *(in the game: $8, used only on dry ground. A full tub is about ten pans. Each pan clouds it, clay-rich gravel most. A pan dipped in muddy water settles slower, glints less and hides more colour at the reveal, and the pan and its water show brown. Changing the water tips out the mud and hauls fresh, which takes the site's long water fetch. Digging and panning wait meanwhile.)*
6. Spiral wheel concentrator: a finishing machine for the jar. Faster and gentler on fines than hand panning, but lossy when mistuned (tilt, spray, feed). It sets up at found stretches or a camp spot in town, never the Home Creek.

Steps 0–1 are the pan itself, the tool the player can never lose. Steps 3–4 make the concentrate jar worth more over time. Step 5 extends where the pan can reach. Step 6 is where hand finishing hands off to a machine. None of them needs a consumable that can run out.

The player should never outgrow prospecting completely. Better operations make scouting more important because the cost of choosing the wrong location becomes larger.

---

## Example Emergent Story

The player finances a compact wash setup for a broad gravel bar after a promising initial sample. The reserve estimate proves too optimistic, a flood damages the water intake, and payroll plus lease payments outpace recovery.

They sell a damaged conveyor, release a worker, and lose the claim. Their portable pan, shovel, classifier, and field notes remain. They return to a creek bend, work inexpensive pay dirt, and use their accumulated knowledge to find color where a new player might not. They earn enough for a sample kit, confirm a low-cost dry wash, and use that claim to rebuild.

Later, the player hires an equipment operator to keep the dry wash active while they scout a nearby valley. The player is no longer merely extracting material; they are operating the present while personally discovering the future.

---

## Implementation Principles

- Make every site finite but leave room for revisits with better tools.
- Tie scale to physical location capacity, not only currency or progression level.
- Preserve a permanent low-cost recovery path.
- Make workers consume money and solve time constraints.
- Use staffing, logistics, and reserves to prevent passive income from becoming trivial.
- Let the player learn machine behavior visually before exposing detailed analytics.
- Build each gear item around a unique material-flow interaction.
- Use cleanouts, unloads, inspections, and sample reveals as tactile reward moments.
- Make failure create stories, not dead ends.

## One-Sentence Product Thesis

> A hands-on prospecting and mining game where players read real places, operate visually distinct equipment, build finite claims into temporary businesses, hire crews to sustain today’s work, and repeatedly risk everything to find tomorrow’s better ground.
