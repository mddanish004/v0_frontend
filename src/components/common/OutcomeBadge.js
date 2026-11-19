import { getOutcomeDisplay } from '@/utils/matchOutcome';
import styles from './OutcomeBadge.module.scss';

// Small tag showing how a match was decided (e.g. "Walkover").
// Renders nothing for regular matches.
const OutcomeBadge = ({ outcome, short = false, className = '' }) => {
    const display = getOutcomeDisplay(outcome);
    if (!display) return null;

    return (
        <span
            className={`${styles.badge} ${styles[display.variant] || ''} ${className}`}
            title={outcome?.reason || display.label}
        >
            {short ? display.shortLabel : display.label}
        </span>
    );
};

export default OutcomeBadge;
