import type { ActionWithInsight } from '../../db/repositories/actions';
import type { Watch } from '../../db/repositories/watches';
import type { WatchTrigger } from '../watch/WatchMatcher';
import { parseEntities } from '../validator/InsightValidator';

/**
 * "You've done this three times. Want me to do it from now on?"
 *
 * ── The PRD's FR10, and why it matters more than it looks ──────────────────
 * Every card in the inbox is an interruption. The product's promise is fewer
 * of them over time, and this is the mechanism: the app watches what the
 * person does by hand, notices repetition, and offers — once, politely — to
 * take it over. Accepting creates an ordinary watch, visible and revocable on
 * the Watch tab. Nothing is ever automated without that tap.
 *
 * Two kinds of repetition matter. Tracking the same merchant again and again
 * ("always track Swiggy") removes taps. Ignoring the same sender again and
 * again ("always ignore Myntra") removes *noise*, which is the thing people
 * actually uninstall over — so the negative suggestion is offered on equal
 * terms with the positive one.
 *
 * Pure: takes history and existing watches, returns at most one suggestion.
 * One, because two questions at once is a form, and a form is what the inbox
 * must never become.
 */

/** How many identical hand-made decisions before the offer is made. */
export const REPEAT_THRESHOLD = 3;
/** Only recent behaviour counts as a pattern. */
const WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export type SuggestableAction = 'track' | 'remind' | 'ignore';

export interface PolicySuggestion {
  /** Stable, so a "not now" can be remembered. `always:track:finance:swiggy` */
  key: string;
  title: string;
  body: string;
  count: number;
  /** The watch that accepting creates. */
  watch: {
    title: string;
    category: string;
    action_type: Watch['action_type'];
    trigger: WatchTrigger;
  };
}

const SUGGESTABLE = new Set<string>(['track', 'remind', 'ignore']);

/** "Swiggy" → "swiggy"; "HDFC Bank" → "hdfc bank". Stable across cases and punctuation. */
export function entityKey(entity: unknown): string | null {
  if (typeof entity !== 'string') return null;
  const k = entity.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return k.length >= 3 ? k : null;
}

function verbFor(action: SuggestableAction): string {
  return action === 'track' ? 'track' : action === 'remind' ? 'set reminders for' : 'ignore';
}

function nounFor(category: string, entity: string): string {
  switch (category) {
    case 'finance': return `${entity} payments`;
    case 'bill': return `${entity} bills`;
    case 'delivery': return `${entity} deliveries`;
    case 'travel': return `${entity} bookings`;
    case 'task': return `reminders from ${entity}`;
    default: return `messages from ${entity}`;
  }
}

function alreadyCovered(watches: Watch[], category: string, entity: string, action: string): boolean {
  return watches.some((w) => {
    if (w.enabled !== 1) return false;
    const type = w.action_type === 'auto_track' ? 'track' : w.action_type;
    if (type !== action) return false;
    try {
      const t = JSON.parse(w.trigger_json) as WatchTrigger;
      if (t.category && t.category !== category) return false;
      return (t.merchants ?? []).some((m) => m.toLowerCase() === entity);
    } catch {
      return false;
    }
  });
}

/**
 * The single best offer to make right now, or null.
 *
 * `dismissedKeys` are offers the person has already said "not now" to. They
 * are never repeated — a suggestion that comes back is a nag.
 */
export function suggestPolicy(
  history: ActionWithInsight[],
  watches: Watch[],
  dismissedKeys: Set<string>,
  now: number = Date.now(),
): PolicySuggestion | null {
  const since = now - WINDOW_MS;
  const groups = new Map<string, { count: number; latest: number; entity: string; category: string; action: SuggestableAction; display: string }>();

  for (const row of history) {
    if (row.executed_at < since) continue;
    if (!SUGGESTABLE.has(row.action_type)) continue;
    const e = parseEntities(row.entities_json);
    const key = entityKey(e.entity);
    if (!key) continue;
    const action = row.action_type as SuggestableAction;
    const id = `${action}|${row.category}|${key}`;
    const g = groups.get(id);
    if (g) {
      g.count += 1;
      g.latest = Math.max(g.latest, row.executed_at);
    } else {
      groups.set(id, {
        count: 1,
        latest: row.executed_at,
        entity: key,
        category: row.category,
        action,
        display: String(e.entity),
      });
    }
  }

  const candidates = [...groups.values()]
    .filter((g) => g.count >= REPEAT_THRESHOLD)
    .filter((g) => !alreadyCovered(watches, g.category, g.entity, g.action))
    .map((g) => ({ g, key: `always:${g.action}:${g.category}:${g.entity}` }))
    .filter(({ key }) => !dismissedKeys.has(key))
    .sort((a, b) => b.g.count - a.g.count || b.g.latest - a.g.latest);

  const best = candidates[0];
  if (!best) return null;
  const { g, key } = best;
  const noun = nounFor(g.category, g.display);

  return {
    key,
    count: g.count,
    title: `Always ${verbFor(g.action)} ${noun}?`,
    body:
      g.action === 'ignore'
        ? `You've ignored ${g.count} of these. Niva can keep them out of your inbox for good.`
        : `You've done this ${g.count} times. Niva can handle it and show you what it did in Activity.`,
    watch: {
      title: `${g.action === 'ignore' ? 'Ignore' : g.action === 'remind' ? 'Remind me about' : 'Track'} ${noun}`,
      category: g.category,
      action_type: g.action,
      trigger: { category: g.category, merchants: [g.entity] },
    },
  };
}
