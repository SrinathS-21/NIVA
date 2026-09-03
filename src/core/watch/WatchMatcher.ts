import { randomUUID } from 'expo-crypto';
import { insertAction, type Action } from '../../db/repositories/actions';
import { getInboxInsights, updateInsightStatus, type Insight } from '../../db/repositories/insights';
import {
  getEnabledWatches,
  incrementWatchHandled,
  type Watch,
} from '../../db/repositories/watches';
import { scheduleReminder } from '../notify/Reminders';

/**
 * Watches, applied.
 *
 * A watch is the user's standing instruction: "you already know what I do with
 * these — stop asking". Until now the Watch tab wrote rows to SQLite that
 * nothing ever read, so every rule the user wrote was a note to itself. This
 * is the half that was missing.
 *
 * The rule the whole file turns on: a watch may only ever *remove work*, never
 * create it. It can hand an insight to the action the user pre-approved, and
 * that is all. It cannot re-categorise, cannot delete, and cannot fire on
 * something the model was unsure about — see `MIN_AUTO_CONFIDENCE`.
 */

/**
 * How certain the model has to be before a rule is allowed to act without
 * asking.
 *
 * The inbox already splits at 0.85 into Auto and Review, and anything landing
 * in Review is by definition something the user should see. Automating a
 * low-confidence read is how a watch silently files a misparsed message; the
 * cost of the opposite mistake is one extra tap.
 */
const MIN_AUTO_CONFIDENCE = 0.85;

/**
 * What a watch matches on.
 *
 * Every field is optional and they combine with AND, so `{}` matches nothing —
 * an empty rule is a bug in whatever created it, not a rule that catches
 * everything. Older rows carry only `{ category, title }`; both still parse.
 */
export interface WatchTrigger {
  category?: string;
  /** Any one of these appearing in the title, summary or entities is a match. */
  keywords?: string[];
  /** Merchant / biller / provider names. Matched against entity fields only. */
  merchants?: string[];
  minAmount?: number;
  maxAmount?: number;
  /** Present on reminder-style rules. Carried through to the action payload. */
  daysBefore?: number;
}

export interface WatchMatch {
  watch: Watch;
  /** The action that was applied, or null when the rule only counted the hit. */
  action: Action['action_type'] | null;
  /** Why it was not applied, when it was not. */
  heldBack?: 'low_confidence';
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function parseTrigger(raw: string): WatchTrigger {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      category: typeof parsed.category === 'string' ? parsed.category : undefined,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : undefined,
      merchants: Array.isArray(parsed.merchants) ? parsed.merchants.map(String) : undefined,
      minAmount: typeof parsed.minAmount === 'number' ? parsed.minAmount : undefined,
      maxAmount: typeof parsed.maxAmount === 'number' ? parsed.maxAmount : undefined,
      daysBefore: typeof parsed.daysBefore === 'number' ? parsed.daysBefore : undefined,
    };
  } catch {
    return {};
  }
}

function entitiesOf(insight: Insight): Record<string, unknown> {
  try {
    return JSON.parse(insight.entities_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Everything about an insight a keyword could reasonably appear in. */
function searchableText(insight: Insight, entities: Record<string, unknown>): string {
  const entityText = Object.values(entities)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(' ');
  return `${insight.title} ${insight.summary} ${entityText}`.toLowerCase();
}

/** The named party, whatever the schema for this category happens to call it. */
function merchantOf(entities: Record<string, unknown>): string {
  const candidates = [
    entities.merchant,
    entities.biller_name,
    entities.provider,
    entities.source,
    entities.entity,
  ];
  return candidates.filter((c) => typeof c === 'string').join(' ').toLowerCase();
}

export function matchesTrigger(insight: Insight, trigger: WatchTrigger): boolean {
  // An empty trigger matches nothing. See the interface comment.
  const hasAnyCriterion =
    trigger.category !== undefined ||
    (trigger.keywords?.length ?? 0) > 0 ||
    (trigger.merchants?.length ?? 0) > 0 ||
    trigger.minAmount !== undefined ||
    trigger.maxAmount !== undefined;
  if (!hasAnyCriterion) return false;

  if (trigger.category && trigger.category !== insight.category) return false;

  const entities = entitiesOf(insight);

  if (trigger.minAmount !== undefined || trigger.maxAmount !== undefined) {
    const amount =
      typeof entities.amount === 'number'
        ? entities.amount
        : typeof entities.amount_due === 'number'
          ? entities.amount_due
          : null;
    // A bounded rule cannot match something with no figure to bound.
    if (amount === null) return false;
    if (trigger.minAmount !== undefined && amount < trigger.minAmount) return false;
    if (trigger.maxAmount !== undefined && amount > trigger.maxAmount) return false;
  }

  if (trigger.merchants?.length) {
    const merchant = merchantOf(entities);
    const hit = trigger.merchants.some((m) => merchant.includes(m.toLowerCase()));
    if (!hit) return false;
  }

  if (trigger.keywords?.length) {
    const haystack = searchableText(insight, entities);
    const hit = trigger.keywords.some((k) => haystack.includes(k.toLowerCase()));
    if (!hit) return false;
  }

  return true;
}

// ─── Application ──────────────────────────────────────────────────────────────

/** A watch's `auto_track` is a `track` once it reaches the actions table. */
function actionTypeFor(watch: Watch): Action['action_type'] {
  return watch.action_type === 'auto_track' ? 'track' : watch.action_type;
}

/** What status an applied action leaves the insight in. */
function statusFor(actionType: Action['action_type']): Insight['status'] {
  return actionType === 'ignore' ? 'dismissed' : 'actioned';
}

/**
 * Is this insight's confidence a measurement, or a number this app chose?
 *
 * A *generic* card exists because the user's own space rule claimed a message
 * the engine had no schema for. Its confidence is `GENERIC_CONFIDENCE` — a
 * constant we picked so the card lands in Review, not something the model
 * reported. Gating on it would mean a person who wrote "when something lands
 * in Pets, remind me" gets no reminder, for a message their own words
 * matched. The rule is the authority there; the gate exists to stop a *model*
 * misreading being auto-filed, which is a different thing entirely.
 */
function confidenceIsMeasured(insight: Insight): boolean {
  try {
    return (JSON.parse(insight.entities_json) as { generic?: boolean }).generic !== true;
  } catch {
    return true;
  }
}

/**
 * Runs every enabled watch against one insight and applies the first that
 * matches.
 *
 * First, not all: two rules both claiming an insight is a conflict the user
 * never expressed an opinion about, and applying both would write two action
 * rows for one decision. Rules are ordered newest-first by the repository, so
 * the most recently written rule wins — which is the one the user was most
 * recently thinking about.
 *
 * Returns the match so the caller can decide whether the insight still belongs
 * in the inbox. Nothing here touches UI state; that is the ingestion layer's
 * job.
 */
export async function applyWatches(insight: Insight): Promise<WatchMatch | null> {
  const watches = await getEnabledWatches();
  if (watches.length === 0) return null;

  for (const watch of watches) {
    const trigger = parseTrigger(watch.trigger_json);
    if (!matchesTrigger(insight, trigger)) continue;
    return applyWatchToInsight(watch, insight, trigger);
  }

  return null;
}

/**
 * One rule, one insight, applied.
 *
 * Split out of the loop so a newly written watch can be run over what is
 * already waiting in the inbox — the person who just wrote "ignore Myntra"
 * with four Myntra cards on screen expects them to go, not to wait for the
 * fifth.
 */
export async function applyWatchToInsight(
  watch: Watch,
  insight: Insight,
  trigger: WatchTrigger = parseTrigger(watch.trigger_json),
): Promise<WatchMatch> {
  // A rule that matched still counts as a hit even when it is not allowed to
  // act — that is what makes "3 handled" on the Watch card honest, and it is
  // the signal that a rule is firing on things the model is unsure about.
  await incrementWatchHandled(watch.id);

  if (confidenceIsMeasured(insight) && insight.confidence < MIN_AUTO_CONFIDENCE) {
    return { watch, action: null, heldBack: 'low_confidence' };
  }

  const actionType = actionTypeFor(watch);

  /**
   * A rule that says "remind me" sets a real reminder, honouring the
   * "3 days before" the user wrote. A rule that says "add to calendar"
   * cannot open the calendar app on their behalf — that dialog is the
   * confirmation step, and a watch is precisely the thing that runs
   * without one — so it sets a reminder instead and says so, and the
   * detail screen offers the calendar button when they open it.
   */
  let notificationId: string | null = null;
  if (actionType === 'remind' || actionType === 'calendar') {
    const scheduled = await scheduleReminder(insight, { daysBefore: trigger.daysBefore }).catch(() => null);
    notificationId = scheduled?.id ?? null;
  }

  await updateInsightStatus(insight.id, statusFor(actionType));
  await insertAction({
    id: randomUUID(),
    insight_id: insight.id,
    action_type: actionType,
    payload_json: JSON.stringify({
      via: 'watch',
      watch_id: watch.id,
      watch_title: watch.title,
      notificationId,
      ...(actionType === 'calendar' ? { calendar: 'deferred' } : {}),
    }),
    executed_at: Date.now(),
  });

  return { watch, action: actionType };
}

/**
 * Run a rule over everything currently waiting. Returns how many it handled.
 *
 * Low-confidence cards are skipped exactly as they would be live, so a new
 * rule cannot do by batch what it is forbidden to do one at a time.
 */
export async function applyWatchToPending(watch: Watch): Promise<number> {
  const trigger = parseTrigger(watch.trigger_json);
  const pending = await getInboxInsights();
  let handled = 0;
  for (const insight of pending) {
    if (!matchesTrigger(insight, trigger)) continue;
    const match = await applyWatchToInsight(watch, insight, trigger);
    if (match.action) handled += 1;
  }
  return handled;
}

/** "Matches: swiggy, zomato · over ₹500 · 3 days before" — the rule, in words. */
export function describeTrigger(trigger: WatchTrigger): string {
  const parts: string[] = [];
  if (trigger.merchants?.length) parts.push(trigger.merchants.join(', '));
  else if (trigger.keywords?.length) parts.push(trigger.keywords.join(', '));
  if (trigger.minAmount !== undefined) parts.push(`over ₹${trigger.minAmount.toLocaleString('en-IN')}`);
  if (trigger.maxAmount !== undefined) parts.push(`under ₹${trigger.maxAmount.toLocaleString('en-IN')}`);
  if (trigger.daysBefore !== undefined) parts.push(`${trigger.daysBefore} days before`);
  return parts.length ? parts.join(' · ') : 'everything in this space';
}

export { parseTrigger };

// ─── Rule authoring ───────────────────────────────────────────────────────────

/**
 * Words that carry no discriminating power in a rule.
 *
 * A rule built from "Track all my food spending" must not end up keyed on
 * "all" or "my" — those appear in half of everything and would make the rule
 * fire on the whole inbox. What is left after this filter ("food", "spending")
 * is what the user actually meant.
 */
const STOP_WORDS = new Set([
  'a', 'all', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'before', 'but', 'by',
  'do', 'dont', 'each', 'every', 'for', 'from', 'get', 'i', 'if', 'in', 'into',
  'is', 'it', 'keep', 'me', 'miss', 'my', 'never', 'of', 'on', 'or', 'out',
  'so', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'to', 'track', 'up', 'want', 'was', 'watch', 'we', 'what', 'when',
  'where', 'which', 'with', 'you', 'your',
]);

/**
 * A trigger for a rule the app proposed, rather than one the user wrote.
 *
 * Learned policies ("always track Swiggy payments") arrive with the merchant
 * already known, so there is no sentence to parse. Kept next to
 * `buildTriggerFromText` so the two ways a trigger comes to exist sit
 * together.
 */
export function buildTriggerForEntity(category: string, entity: string): WatchTrigger {
  return { category, merchants: [entity.toLowerCase()] };
}

/**
 * Turns what the user typed into something matchable.
 *
 * Watches are authored as a sentence — that is the whole appeal of the
 * feature — but a sentence is not a predicate. This is the cheapest honest
 * bridge: keep the category, keep the words that carry meaning, and pick up a
 * "3 days before"-style reminder offset if one was written. It is deliberately
 * not a model call: a rule whose behaviour the user cannot predict is worse
 * than a blunt one.
 */
export function buildTriggerFromText(text: string, category: string): WatchTrigger {
  const normalized = text.toLowerCase();

  const keywords = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 8);

  const trigger: WatchTrigger = { category };
  if (keywords.length) trigger.keywords = keywords;

  const daysBefore = normalized.match(/(\d+)\s*days?\s*(before|ahead|prior)/);
  if (daysBefore) trigger.daysBefore = parseInt(daysBefore[1], 10);

  const over = normalized.match(/(?:over|above|more than)\s*(\d[\d,]*)/);
  if (over) trigger.minAmount = Number(over[1].replace(/,/g, ''));

  const under = normalized.match(/(?:under|below|less than)\s*(\d[\d,]*)/);
  if (under) trigger.maxAmount = Number(under[1].replace(/,/g, ''));

  return trigger;
}
