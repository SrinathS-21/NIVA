import { File, Paths } from 'expo-file-system';
import { getInsightsForMetrics, type Insight } from '../../db/repositories/insights';
import { getRecentActions } from '../../db/repositories/actions';
import { getAllWatches } from '../../db/repositories/watches';
import { getCustomSpaces } from '../../db/repositories/spaces';
import { parseEntities } from '../validator/InsightValidator';
import { isoDate } from '../../utils/dates';

// Lazily required: expo-sharing is a native module absent in Expo Go / a
// dev client built before the package was added. writeAndShare guards for null.
const Sharing: typeof import('expo-sharing') | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-sharing');
  } catch {
    return null;
  }
})();

/**
 * Your data, out.
 *
 * ── Why this is a feature and not a chore ───────────────────────────────────
 * "Nothing leaves your phone" is only a virtue if *you* can take it with you.
 * An app that holds a year of your bills and payments and offers no way out
 * is a lock-in dressed as privacy. So: everything, in two shapes — a CSV a
 * spreadsheet opens, and a JSON that is the whole database minus the raw
 * message text (which stays here, because a "share" is exactly the moment
 * it could leave).
 *
 * The share sheet is the destination. Drive, email, a laptop over
 * Nearby Share — the person picks; the app never picks for them.
 */

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per insight: the columns a spreadsheet user actually wants. */
export function insightsToCsv(insights: Insight[]): string {
  const header = ['date', 'space', 'title', 'from', 'amount', 'currency', 'direction', 'due', 'status', 'summary'];
  const lines = [header.join(',')];
  for (const i of insights) {
    const e = parseEntities(i.entities_json);
    lines.push(
      [
        isoDate(new Date(i.created_at)),
        i.category,
        i.title,
        e.entity ?? '',
        typeof e.amount === 'number' ? e.amount : '',
        e.currency ?? '',
        e.direction ?? '',
        e.dueDate ?? e.date ?? e.eta ?? '',
        i.status,
        i.summary,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

async function writeAndShare(name: string, mimeType: string, contents: string): Promise<boolean> {
  if (!Sharing) return false; // native module absent — export unavailable in this build
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Export from Niva', UTI: mimeType });
  return true;
}

/** Every insight, as a spreadsheet. */
export async function exportInsightsCsv(): Promise<boolean> {
  const insights = await getInsightsForMetrics(5000);
  const stamp = isoDate(new Date());
  return writeAndShare(`niva-insights-${stamp}.csv`, 'text/csv', insightsToCsv(insights));
}

/**
 * The whole store, minus raw message text.
 *
 * Insights, actions, watches, custom spaces. Raw signals are deliberately
 * excluded: they are the one thing in the database that is verbatim
 * personal correspondence, and a backup is exactly the moment it would
 * leave the phone.
 */
export async function exportEverythingJson(): Promise<boolean> {
  const [insights, actions, watches, spaces] = await Promise.all([
    getInsightsForMetrics(5000),
    getRecentActions(5000),
    getAllWatches(),
    getCustomSpaces(),
  ]);
  const payload = {
    app: 'niva',
    exportedAt: new Date().toISOString(),
    version: 1,
    insights,
    actions,
    watches,
    spaces,
  };
  const stamp = isoDate(new Date());
  return writeAndShare(`niva-export-${stamp}.json`, 'application/json', JSON.stringify(payload, null, 2));
}
