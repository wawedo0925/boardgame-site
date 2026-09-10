# Clocktower audit — 2026-09-11

Scope: the implemented Trouble Brewing script (22 characters), 5–15 players. Rules were checked against the supplied Korean rulebook and night sheets.

## Fixed defect

The Imp proposal accepted a victim override before checking the original target. This allowed an attack on a protected player to kill another player, and allowed ordinary targets to redirect death. The engine now resolves the original attack first and accepts replacement choices only for an active, unprotected Mayor. The storyteller interface exposes the replacement selector only in that case. Replacement victims still receive their own protection checks.

The regression test failed on the original code and passed after the fix.

## Validation

- `tests/clocktower-exhaustive.cjs`: 829,244 legal role/display-role sets; composition and one generated information draft per set; 1,658,488 first/subsequent-night schedules; 9,736 living-neighbor cases.
- `tests/clocktower-interactions.cjs`: 782 independent protection, impairment, death and succession cases; 1,100 seeded legal setups producing 4,374 simulated nights and 18,622 ability resolutions.
- `tests/clocktower-audit-db.sql`: passed against the current database inside a rolled-back transaction. Covers 352 health-state combinations, 8 execution/succession cases, 2 Saint cases, request/reply/approval/acknowledgment/dawn, stale and duplicate approvals, and private snapshot visibility. Fixtures were not retained.
- Existing information, setup, night, seating/status and voting tests passed.
- Targeted ESLint and production Next.js build passed. The first sandboxed build could not fetch Google Fonts; the network-enabled retry passed.

## Limits

This enumerates legal role sets, not all seat permutations, information drafts, player choices or entire game histories. Simulated nights are bounded and do not replace an offline game with multiple physical phones. Other scripts, Travelers and Fabled are outside this audit. The server integration tests exercise persistence and authorization; they do not constitute a second independent runtime rules engine. No claim is made that every possible game is error-free.

The SQL audit requires an owner connection, eight existing auth users and an event without an active Clocktower room. It creates temporary fixtures inside a transaction and ends with `ROLLBACK`.
