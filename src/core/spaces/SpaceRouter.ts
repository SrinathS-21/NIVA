import type { Insight } from '../../db/repositories/insights';

/**
 * How a user-made space claims insights.
 *
 * The model only knows the five built-in domains. A space called "Pets" or
 * "Rent" has no tool behind it, so without this every insight would land in a
 * built-in and the space the user made would stay empty forever — a place with
 * a name and a colour and nothing that could ever reach it.
 *
 * A rule is deliberately plain: words that appear in the message, and senders
 * it comes from. Both are things a person can write from memory ("Swiggy,
 * Zomato, food") and predict the effect of. There is no model in the loop; a
 * rule whose behaviour you cannot guess is worse than a blunt one.
 */
export interface SpaceRule {
  /** Any one of these in the title, summary, entities or sender is a match. */
  keywords?: string[];
  /** Sender ids or names. `HDFCBK`, `Swiggy`. Case-insensitive contains. */
  senders?: string[];
}

export interface RoutableSpace {
  key: string;
  rule: SpaceRule | null;
}

export interface RouteContext {
  sender?: string | null;
  packageName?: string | null;
}

/** Normalise what the user typed into a rule. "Swiggy, Zomato ,food" → three keywords. */
export function parseRuleText(keywordsText: string, sendersText = ''): SpaceRule | null {
  const split = (s: string) =>
    s
      .split(/[,\n;]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 1);
  const keywords = split(keywordsText);
  const senders = split(sendersText);
  if (keywords.length === 0 && senders.length === 0) return null;
  return {
    ...(keywords.length ? { keywords } : {}),
    ...(senders.length ? { senders } : {}),
  };
}

export function ruleToText(rule: SpaceRule | null | undefined): { keywords: string; senders: string } {
  return {
    keywords: rule?.keywords?.join(', ') ?? '',
    senders: rule?.senders?.join(', ') ?? '',
  };
}

export function parseRuleJson(raw: string | null | undefined): SpaceRule | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rule: SpaceRule = {};
    if (Array.isArray(parsed.keywords)) rule.keywords = parsed.keywords.map((k) => String(k).toLowerCase());
    if (Array.isArray(parsed.senders)) rule.senders = parsed.senders.map((s) => String(s).toLowerCase());
    return rule.keywords?.length || rule.senders?.length ? rule : null;
  } catch {
    return null;
  }
}

function haystackFor(insight: Pick<Insight, 'title' | 'summary' | 'entities_json'>, ctx: RouteContext): string {
  let entityText = '';
  try {
    const e = JSON.parse(insight.entities_json) as Record<string, unknown>;
    entityText = Object.values(e)
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .join(' ');
  } catch {
    // No entities to search; the title and summary still count.
  }
  return `${insight.title} ${insight.summary} ${entityText} ${ctx.sender ?? ''} ${ctx.packageName ?? ''}`.toLowerCase();
}

export function matchesSpaceRule(
  insight: Pick<Insight, 'title' | 'summary' | 'entities_json'>,
  rule: SpaceRule,
  ctx: RouteContext = {},
): boolean {
  if (rule.senders?.length) {
    const sender = `${ctx.sender ?? ''} ${ctx.packageName ?? ''}`.toLowerCase();
    if (sender.trim() && rule.senders.some((s) => sender.includes(s))) return true;
  }
  if (rule.keywords?.length) {
    const hay = haystackFor(insight, ctx);
    if (rule.keywords.some((k) => hay.includes(k))) return true;
  }
  return false;
}

/**
 * Does any user-made space claim this *raw* message?
 *
 * Checked before the noise filter and before the engine. A person who wrote
 * "PawPals, vet" into a Pets space has told Niva that those messages matter
 * to them, whatever the promo filter or the model thinks — and the model
 * only knows five kinds of consequence, so a message about a vet visit
 * would otherwise be dropped before their rule ever saw it.
 */
export function routeRawText(rawText: string, spaces: RoutableSpace[], ctx: RouteContext = {}): string | null {
  return routeToSpace({ title: rawText, summary: '', entities_json: '{}' }, spaces, ctx);
}

/**
 * The space an insight belongs to, given the user's rules.
 *
 * Returns the first custom space whose rule matches, or null to leave the
 * model's category alone. First rather than best: two spaces both claiming a
 * message is a conflict the user never expressed an opinion about, and the
 * order spaces were created in is at least a stable answer.
 */
export function routeToSpace(
  insight: Pick<Insight, 'title' | 'summary' | 'entities_json'>,
  spaces: RoutableSpace[],
  ctx: RouteContext = {},
): string | null {
  for (const space of spaces) {
    if (!space.rule) continue;
    if (matchesSpaceRule(insight, space.rule, ctx)) return space.key;
  }
  return null;
}
