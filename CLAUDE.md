# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This repo is **design-only**. It contains no source code, no build system, no package manifest, no tests, and no git history — just `gold_prospecting_game_design.md` and a `.vscode/settings.json` holding editor color customizations.

There are therefore **no build, lint, test, or run commands yet**. Do not invent or claim any. If asked to implement something, the engine/language/toolchain is an open decision — confirm it with the user before scaffolding, since nothing in the repo constrains that choice.

## Source of truth

`gold_prospecting_game_design.md` is the complete spec for a prospecting/small-scale-mining game. Read it before proposing mechanics, systems, or data models — it already specifies location traits, site archetypes, equipment tiers, staffing tables, economy formulas, and a reference UX spec. Keep it updated as the design evolves; prefer editing it over scattering design notes into code comments.

## Design invariants

These cut across the whole document and are easy to violate when implementing one system in isolation:

- **Site capacity gates equipment, not player level or cash.** Whether a wash plant is available is a property of the location's footprint, water, access, depth, and stability — never a progression unlock. Any system that grants gear by level or money contradicts the core design.
- **Reserves are layered, not a single depletion bar.** Surface / pay layer / deep-or-difficult / tailings-recovery / rare-find. A claim exhausted for a pan must still be able to be profitable later for a better machine, so the data model needs per-layer state that survives "depletion."
- **Failure downsizes, it never ends the run.** The anti-death-spiral rules are hard constraints: basic panning must never require a consumable that can hit zero, at least one free/near-free prospecting site must always be reachable, and a failed claim must always yield salvage, data, or a lead. Debt restricts expansion; it never confiscates the recovery toolkit.
- **Uncertainty is reduced, never eliminated.** Prospecting, surveys, sensors, and foremen improve confidence in estimates; no upgrade should make reserve or recovery numbers exact.
- **Staff buy time, not output.** The player is always the most efficient operator on site (see the player-vs-staff efficiency table). Staff exist so the player can be elsewhere prospecting. Crews take a *site-level policy*, not per-worker micromanagement.
- **Every machine follows the same four-stage lifecycle** — setup, operation, interruption, harvest — but each must have its own material flow, failure mode, in-run decision, and payoff action. A machine implemented as a timer with a multiplier is a design regression. The four-question design test in "Design test for every tool" applies to every new piece of gear.
- **Physical readability precedes analytics.** Machine state is communicated by visible water, dirt, dust, belts, and concentrate first; numeric panels are optional and secondary.
- **Material keeps its identity through processing.** Chains are concrete (bank → bucket → classifier → sluice → moss → cleanup pan → gold), never abstract A→B conversions. Delayed reveal at cleanout is deliberate — recovery is not known until the concentrate is finish-processed.

## Reference implementation target

The **Sluice UX Specification** section is the reference interaction the rest of the equipment chain is measured against. When building or reviewing any machine, compare it to that spec's level of detail: named operating states (underpowered / balanced / overpowered) with distinct visuals and mechanical consequences, a small set of continuous player controls, and a multi-step harvest sequence.
