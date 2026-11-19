// How a match was decided. Keys are the `outcome.type` values returned by the
// API (see v0_backend/outcomes.py). The frontend only displays outcomes; all
// rules (who wins, standings, bracket) live in the backend.
//
// To support a new outcome (e.g. FORFEIT or BYE), add one entry here and, if it
// needs its own colour, a matching class in components/common/OutcomeBadge.module.scss.
export const MATCH_OUTCOMES = {
    REGULAR: null, // played match: no badge
    WALKOVER: { label: 'Walkover', shortLabel: 'W/O', variant: 'walkover' },
};

// Outcomes a referee may declare from the UI. The backend accepts any
// registered declarable outcome through /declare-outcome, so adding FORFEIT or
// BYE here is enough to expose a new button and dialog in the referee flow.
export const DECLARABLE_OUTCOMES = {
    WALKOVER: {
        help: 'The selected team wins without the match being played. This cannot be undone.',
    },
};

export const declarableOutcomeTypes = () => Object.keys(DECLARABLE_OUTCOMES);

const toLabel = (type) => type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');

// Display info for a match's outcome, or null when no badge is needed.
// Outcome types the frontend doesn't know yet still get a neutral badge.
export const getOutcomeDisplay = (outcome) => {
    const type = outcome?.type;
    if (!type || typeof type !== 'string') return null;
    if (Object.prototype.hasOwnProperty.call(MATCH_OUTCOMES, type)) return MATCH_OUTCOMES[type];
    return { label: toLabel(type), shortLabel: toLabel(type), variant: 'default' };
};

// False when the API says scores don't apply (e.g. a walkover), so the UI must
// not show a 0-0 scoreline. Missing outcome data means a regular match.
export const hasScores = (outcome) => outcome?.scores_applicable !== false;

// Result text for a /get-match-fixtures match: the score for played matches,
// or the outcome label and winner (e.g. "W/O (T004)") when scores don't apply.
export const formatResult = (match) => {
    if (hasScores(match.outcome)) return match.match_result;
    const label = getOutcomeDisplay(match.outcome)?.shortLabel || '-';
    const winner = match.match_status?.winner_team_id;
    return winner ? `${label} (${winner})` : label;
};
