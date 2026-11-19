## How the current scoring mechanism works

A match stores one aggregate integer per team in the `score` table, one row for
each team, rather than per-game or per-set scores. Score rows are normally
created with the match at `0-0`; `0-0` is how v0 represents an unplayed match.

Scores are submitted through `POST /update-score` with:

```json
{ "match_id": 11, "tournament_id": 1, "score": "11-7", "final": true }
```

The endpoint parses the `"a-b"` string, updates or creates both score rows, and
when `final` is true it sets `is_final`, asks the match's outcome handler for
the winner (the higher score for `REGULAR`, empty for a tie), and writes the
winner into the successor bracket match if one exists. It does not change
`status`; status is changed separately through
`POST /update-match-status/<match_id>`.

Standings treat a regular match as played when it is not `0-0`: they add the two
scores to `points_scored` / `points_lost`, count a win for the higher score, and
award 2 ranking points per win in pool and overall standings. For a walkover the
handler counts the declared winner with no points scored. Knockout seeding uses
the same pool standings. The separate round-standings endpoint uses 1 point per
win, which is a pre-existing inconsistency.

## What changes I made and why

- Added `outcomes.py` as the only place that knows how a match was decided. It
  defines a `MatchOutcome` enum (`REGULAR`, `WALKOVER`), an `OutcomeHandler` base
  class, concrete handlers, and an `OUTCOME_HANDLERS` registry. Each handler
  owns whether scores apply, whether the status may change, whether the match
  counts in standings and rating exports, how it tallies, how it is applied,
  and its display label. Unknown or non-declarable outcome names are rejected
  centrally.
- Added `POST /declare-outcome/<match_id>` for any registered declarable
  outcome, plus a `/declare-walkover/<match_id>` shortcut for compatibility.
  Both use the same handler-driven flow: validate the winner and state through
  the handler, lock the match row, apply the outcome and bracket advancement in
  one transaction, and return a clear error for invalid transitions.
- Blocked `/update-score` and status changes for outcomes whose handler says
  scores or status changes do not apply. The scored-match winner rule itself is
  now `OutcomeHandler.winner_from_scores`, used by the score route and the
  standings tally instead of being duplicated.
- Changed standings, second-place standings, knockout seeding, round
  completion, cumulative points, court matches, fixtures, fixture CSV and the
  DUPR export to ask the outcome handler instead of comparing scores or outcome
  strings directly.
- Added a frontend outcome lookup map, a reusable `OutcomeBadge`, and a generic
  declaration dialog in the existing referee flow. Declarable outcomes are
  listed in the same map, so adding a new outcome adds a button and dialog
  without new component logic. Their cards hide the `0-0` scoreline, show the
  badge, and highlight the winner.

The reason for this shape is separation of concerns. `status` remains the
lifecycle, `score` remains what was played, and `outcome_type` says how the
result was reached. Adding Forfeit or Bye means adding an enum member, a
handler, and a display/declaration entry in the frontend map. No backend route,
standings or bracket code changes are needed. Regular matches keep their
existing behaviour, and legacy rows with
no outcome value are read as `REGULAR`.

## Schema and migration changes

Two columns were added to the `match` table:

```sql
ALTER TABLE `match`
ADD COLUMN `outcome_type` VARCHAR(20) NOT NULL DEFAULT 'REGULAR',
ADD COLUMN `outcome_reason` VARCHAR(255) NULL;
```

`outcome_type` is `NOT NULL` with a default, so existing rows become `REGULAR`
without a data backfill. `outcome_reason` is optional and used for walkover
reasons.

Files:

- `migrations/bul/add_match_outcome.sql`
- `migrations/bul/add_match_outcome_down.sql`

Apply the up script to any existing database before running this version:

```bash
mysql -u <user> -p <database> < migrations/bul/add_match_outcome.sql
```

The down script drops both columns and therefore loses outcome data. The
original SQL dump was not modified. New databases created by `db.create_all()`
get the columns from the model, but `create_all()` does not alter existing
tables, so deployed databases need the migration.

## Assumptions

- A walkover means one side did not play at all. It is not a mid-match
  retirement or a forfeit with a partial score.
- A walkover can only be declared while the match is `pending`, both teams are
  known, and no non-zero score has been recorded.
- A walkover records `0-0` internally, configured once as
  `WalkoverOutcome.AWARDED_SCORE`. The frontend hides that scoreline.
- A walkover counts as a played match and a win, scores no points, and is
  excluded from the DUPR rating export.
- A walkover winner advances in a knockout exactly like a regular winner.
- Repeating the same declaration is idempotent. Declaring a different winner,
  or changing a regular result into a walkover, is rejected.
- Unknown or blank `outcome_type` values are treated as `REGULAR` for backward
  compatibility.
- The reason is limited to 255 characters.
- No new dependencies were introduced.

## What I would improve with more time

- Add a real migration tool such as Alembic instead of hand-run SQL files.


