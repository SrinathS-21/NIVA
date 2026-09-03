import type { SpaceMetrics } from '../core/metrics/spaceMetrics';

/**
 * What a space is worth saying in one line, and in two.
 *
 * These lived inside the Spaces screen as closures over its state, which was
 * fine while exactly one space was ever on show. A grid puts every space on
 * screen at once and a detail page shows one in full, so the same two sentences
 * are now needed in two places — and a headline that disagreed with itself
 * between the card and the page you reach by tapping it would be worse than
 * having no headline at all.
 *
 * Pure functions of a key and the space's figures. No component state, nothing
 * to drift.
 *
 * ── Where the figures come from ────────────────────────────────────────────
 * They used to come from `MOCK_SPACE_METRICS`, unconditionally — not as a
 * fallback for an empty database but as the only source there was. Every
 * number on the Spaces tab was therefore a constant, identical on a fresh
 * install and after six months of use. They are computed from the insight rows
 * now (`src/core/metrics/spaceMetrics.ts`); `metrics` being null means "not
 * loaded yet", and every function here degrades to the one thing any space can
 * always answer: how much of it is waiting.
 */

const rupees = (n: number | undefined) => '₹' + Math.round(n ?? 0).toLocaleString('en-IN');

/**
 * The number the space leads with.
 *
 * A space with no figures of its own falls back to how much of it is waiting,
 * which is the one thing every space can always answer.
 */
export function spacePrimary(
  key: string,
  pending: number,
  metrics?: SpaceMetrics | null,
): string {
  if (!metrics) return `${pending} pending`;

  switch (key) {
    case 'finance':
      return rupees(metrics.expenses);
    case 'bill':
      return rupees(metrics.upcomingAmount);
    case 'delivery':
      return `${(metrics.arriving ?? 0) + (metrics.inTransit ?? 0)} active`;
    case 'travel':
      return `${metrics.pending} upcoming`;
    case 'task':
      return `${metrics.pending} active`;
    default:
      return `${pending} pending`;
  }
}

/**
 * The line under it — the breakdown, for a screen with room for one.
 */
export function spaceSummary(
  key: string,
  pending: number,
  metrics?: SpaceMetrics | null,
): string {
  if (!metrics) return `${pending} need attention`;

  switch (key) {
    case 'finance':
      return metrics.subscriptions
        ? `↑ ${rupees(metrics.income)} in · ↓ ${rupees(metrics.expenses)} out · ${metrics.subscriptions} subscription${metrics.subscriptions === 1 ? '' : 's'}`
        : `↑ ${rupees(metrics.income)} in · ↓ ${rupees(metrics.expenses)} out`;
    case 'bill':
      return `${metrics.dueThisWeek ?? 0} due this week · ${metrics.handled} paid`;
    case 'delivery':
      return `${metrics.inTransit ?? 0} in transit · ${metrics.delivered ?? 0} delivered`;
    case 'travel':
      return `${metrics.dueThisWeek ?? 0} this week · ${metrics.handled} completed`;
    case 'task':
      return `${metrics.dueSoon ?? 0} due soon · ${metrics.overdue ?? 0} overdue`;
    default:
      return `${pending} need attention`;
  }
}

/**
 * The short form, for a card in a grid.
 *
 * Half a screen wide cannot hold "↑ ₹42,000 in · ↓ ₹24,580 out" without
 * wrapping to three lines or truncating mid-figure, and a number cut in half is
 * worse than no number. What survives is the part that decides whether you tap:
 * whether anything in there wants you.
 */
export function spaceStatus(pending: number): string {
  if (pending === 0) return 'All clear';
  return `${pending} need${pending === 1 ? 's' : ''} attention`;
}
