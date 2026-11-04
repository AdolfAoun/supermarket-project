# Agent instructions — supermarket-project

This repository is a university capstone: Lebanon Supermarket Price Comparison System.

## Read before coding
1. `docs/requirements.md` — original 28 requirements; do not silently weaken their meaning.
2. `docs/architecture.md` and `docs/decisions.md` — approved architecture and provisional decisions.
3. `docs/frontend.md`, `docs/database.md`, `docs/api.md`, `docs/roadmap.md` — planned boundaries and current sequencing.

## Engineering rules
- Implement **only the assigned task**; prefer small, demonstrable, testable increments.
- Tech: Expo + React Native + TypeScript; Node.js + Express + TypeScript; MySQL via `mysql2/promise`; WAMP for local database development. One repository and modular monolith backend. Do not introduce Supabase, Firebase, MongoDB, microservices, or Python without explicit approval.
- The mobile app calls the Express API; it **never** connects directly to MySQL. Validate and authorize on the server.
- Keep algorithms simple and understandable. Product matching: normalized exact names and curated aliases; unresolved/ambiguous items prompt a user to select from an existing catalog. Never silently equate different pack sizes.
- Receipt text recognition should use a **no-per-call-fee** option when implemented (ML Kit is a candidate, not yet integrated). Do not add paid APIs or require billing without approval.
- Historical price observations are append-only in normal operations; show freshness and verification; do not present pending/flagged prices as verified. Missing basket items make totals incomplete, not comparable complete prices.
- Keep secrets out of the app bundle, git, source code and logs. Use `.env.example` with placeholders. Never expose a database to public networks for local testing.
- Avoid unnecessary dependencies; stay aligned with supported versions when scaffolding.
- Add useful automated checks/tests and run them where possible. When not runnable, report why. Do not claim verification that did not occur.
- When a requirement appears costly or difficult, flag it with a minimal alternative and **wait for owner approval before changing scope**.
- After each task, summarize changed files, commands run, test outcomes, remaining manual actions, and architecture/documentation updates.
- Do not silently rewrite user requirements, mark tasks complete, or make broad architectural changes. Ask when a decision blocks implementation; otherwise use existing approved choices.

## Collaboration
- ChatGPT + owner: architecture, scoping, task prompts and decisions.
- Codex: primary implementation, working against this repository.
- Claude: optional independent review of important features.
- Repository documentation is the operational source of truth; document confirmed changes here.
