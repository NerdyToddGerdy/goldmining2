# Gold Prospecting Game

> A hands-on prospecting and mining game where players read real places, operate visually distinct equipment, build finite claims into temporary businesses, hire crews to sustain today's work, and repeatedly risk everything to find tomorrow's better ground.

## Status

Design stage. This repository currently contains the design brief only — there is no code, engine, or build yet.

## The idea

You start with a pan and a shovel. You find ground, decide how much to invest before you can be certain it's worth it, and build only what the site physically supports. Every claim runs out. The game is about becoming good enough at reading terrain that you find the next one before the current one stops paying.

Four things hold it together:

- **Locations are finite and physically specific.** Footprint, water, access, depth, stability, and season decide what equipment can work there — not your level or your bank balance. A narrow creek fits a hand sluice and never a wash plant.
- **Reserves come in layers.** Surface material, the pay layer, deep material, tailings, and rare finds. A claim that's exhausted for a pan can be worth returning to with a better machine.
- **Failure downsizes you; it doesn't end you.** Go broke and you sell the conveyor, lose the claim, and go back to panning a creek — keeping your tools, your notes, and the judgment that makes you faster at rebuilding than a new player.
- **Machines are interactions, not timers.** Each one has its own material flow, its own way of going wrong, a decision to make while it runs, and a satisfying way to finish. You should read a sluice's condition by watching the water, before any number tells you.

## The core loop

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

Staff exist so you can leave. You are always the most efficient operator on your own site; hiring a crew buys you the time to go find the next one.

## Repository contents

| File | What it is |
|---|---|
| [`gold_prospecting_game_design.md`](gold_prospecting_game_design.md) | The full design brief — location system, site archetypes, equipment tiers, economy, staffing, material chains, and the sluice UX reference spec |
| [`CLAUDE.md`](CLAUDE.md) | Working notes for Claude Code: repo state and the cross-cutting design invariants that are easy to break when building one system in isolation |

The **Sluice UX Specification** in the design brief is the reference interaction — the level of detail every other piece of equipment is measured against.

## License

[MIT](LICENSE)
