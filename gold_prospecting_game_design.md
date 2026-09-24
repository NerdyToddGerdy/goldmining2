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
- **Finite spots, renewing creek.** Each dig spot has real layered reserves and visibly runs out. High-water events redeposit a modest amount of surface gold along the creek, so the creek as a whole never goes permanently dry, while any single spot can.
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

Pickers sell whole as specimens at 1.5× spot. Prices are grounded in reality (about $120 a gram), so the Home Creek pays modestly, as intended: a skilled day of panning is worth tens of dollars, not hundreds.

The sliding rate creates a small decision: sell now, or keep panning to reach a better rate. Selling never costs anything, so it never blocks the recovery path. Black sand is not bought. It has to be panned to release its gold.

### Leaving the creek

The Home Creek is also how the player finds their next site. Leads point to further creek stretches: shovel-and-pan ground like the Home Creek, but finite. Only the Home Creek renews with high water. Leads come from three places:

- **Following colour upstream.** Dry side gullies join the creek. If one carries gold down from further up, spots just downstream of its mouth are richer, so panning along the creek shows a trail of colour. The player keeps field notes (pans and colour per spot) to read it. A test pan up the right gully that shows colour follows the trail to a new stretch. A barren gully pans empty. This lead is free, always real, and earned by reading the ground.
- **Clues while digging.** Now and then the shovel turns up an old pan, a survey stake, or a note in a tin. It points to a named stretch the player can follow later.
- **The claims board in town.** Leads for sale, restocked every dozen pans:

| Source | Price | Reliability | Estimate |
|---|---:|---:|---|
| Rumour | $2–4 | ~55% real | Very wide, talked up |
| Old claim record | $8–12 | ~85% real | Moderate |
| Map fragment | $15–25 | ~95% real | Narrow |

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
| Gold pan | Slosh and tilt | Water surges toward the lip; light sand spills; black sand and flakes remain | Wash speed versus retaining potential value |
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

The player crouches at the water's edge with a pan of raw creek gravel. They shake it to let the heavy material sink, pick out the rocks, then tilt it and slosh it back and forth so the light sand washes over the lip. The pan's contents shrink down to a streak of black sand, and a last slow turn shows whether there is gold in it.

### Pan material flow

```text
Shovel load of gravel
→ submerge and break up clay
→ shake to stratify (heavies sink)
→ rake off and inspect large rocks
→ slosh and tilt; light material washes over the lip
→ black-sand concentrate
→ final reveal
→ pick flakes and pickers into the vial; save black sand to the concentrate jar
```

### Persistent visual indicators

- **Water clarity:** Muddy water means clay or fines remain unbroken; clear water means the load is working.
- **Material layering:** Pale sand on top, darker material settling toward the bottom and the riffles.
- **Lip spill:** What is going over the edge. Pale sand is fine. A dark streak means black sand, and possibly gold, is being lost.
- **Glints:** Brief flashes during sloshing that hint at gold but never confirm the amount.
- **Pan fill:** The pile visibly shrinks from a full load to a thin concentrate.

### Operating states

| State | Visual signal | Mechanical result | Player response |
|---|---|---|---|
| Timid | Water stays cloudy; material barely moves; little spills over the lip | Very slow; nothing is lost but little is done | Tilt more, slosh faster |
| Balanced | Light sand sheets off the lip; dark layer stays put | Good speed with minimal loss | Continue |
| Aggressive | Dark streaks go over the lip; the pan empties quickly | Fast, but fine gold and black sand are lost | Level the pan and re-stratify |

Stratification matters: shaking the load resets the layering and makes it safe to work faster again. A skilled player alternates between shaking and sloshing. A careless player just sloshes harder.

### Key player controls

- Tilt angle.
- Slosh speed: drag back and forth toward and away from the lip. Each stroke toward the lip surges water and light sand over the edge.
- Shake (stratify) action.
- When to stop and reveal.

### Interruptions

- **Clay balls:** Clay can trap gold and roll it out of the pan. The player must break the clay up underwater.
- **Oversize rocks:** Large rocks need to be raked out, and each one inspected before it is thrown away. There is a small chance of a nugget stuck to one.
- **Poor panning water:** Shallow or muddy water makes stratification slower and the pan harder to read. The player can move to a better spot on the bank.

### Harvest: the reveal

1. Work the pan down to black sand.
2. Hold it level and give it one slow turn to fan the concentrate out.
3. Reveal: no colour, a few specks, a tail of flakes, or a picker.
4. Pick visible gold into the vial by finger, or wet the fingertip to lift fine flakes.
5. Choose whether to save the black sand to the concentrate jar or dump it.

The concentrate jar is the tailings layer at the smallest scale. Saved black sand still holds fine gold that can be re-panned later, and it becomes worth more once better finishing equipment is available.

### Compact inspection panel

| Readout | Purpose |
|---|---|
| Loss estimate | Rough indication of material lost over the lip this pan |
| Pans worked | Session count, for comparing spots |
| Colour per pan | Running average for the current dig spot, approximate |
| Vial contents | Recovered gold, shown physically first, weight second |

---

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

1. Starter sluice: learn flow and feed control.
2. Better classifier: fewer jams and more consistent material size.
3. Improved miner's moss or riffle insert: better fine-material capture.
4. Adjustable legs: reliable slope control at imperfect sites.
5. Recirculating pump: allows operation away from a naturally strong creek, at fuel and maintenance cost.
6. Highbanker hopper: increases material movement but introduces hoses, pump management, and clog risk.
7. Worker operation: staff can run the system at reduced efficiency while the player prospects.
8. Instrumented setup: improved reporting and estimates, while retaining site-specific risks.

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
