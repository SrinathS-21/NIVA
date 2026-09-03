import { matchesSpaceRule, parseRuleText, parseRuleJson, routeToSpace, ruleToText } from '../core/spaces/SpaceRouter';

const insight = (title: string, summary = '', entities: Record<string, unknown> = {}) => ({
  title,
  summary,
  entities_json: JSON.stringify(entities),
});

describe('parseRuleText', () => {
  test('splits on commas, trims, lowercases, drops empties', () => {
    expect(parseRuleText('Swiggy, Zomato ,food,,', ' HDFCBK ')).toEqual({
      keywords: ['swiggy', 'zomato', 'food'],
      senders: ['hdfcbk'],
    });
  });
  test('empty text is no rule', () => {
    expect(parseRuleText('', '')).toBeNull();
    expect(parseRuleText(' , ', '')).toBeNull();
  });
  test('round-trips through ruleToText', () => {
    const rule = parseRuleText('pets, vet', 'PawPals');
    expect(ruleToText(rule)).toEqual({ keywords: 'pets, vet', senders: 'pawpals' });
    expect(ruleToText(null)).toEqual({ keywords: '', senders: '' });
  });
});

describe('reserved space keys', () => {
  /**
   * A space's key becomes a URL segment. `app/(tabs)/spaces/month.tsx` is a
   * static route and wins over `[key]`, so a space called "Month" would open
   * the month screen instead of itself. The store reserves those names the
   * same way it reserves the built-in keys.
   */
  test('a space called "Month" does not steal the /spaces/month route', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync('src/store/categoryStore.ts', 'utf8') as string;
    expect(src).toContain("RESERVED_KEYS");
    expect(src).toMatch(/RESERVED_KEYS\s*=\s*\[[^\]]*'month'/);
    // And the guard is applied on both the base key and the numbered fallback.
    expect(src.match(/RESERVED_KEYS\.includes/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseRuleJson', () => {
  test('tolerates garbage', () => {
    expect(parseRuleJson('not json')).toBeNull();
    expect(parseRuleJson(null)).toBeNull();
    expect(parseRuleJson('{}')).toBeNull();
    expect(parseRuleJson('{"keywords":["Pets"]}')).toEqual({ keywords: ['pets'] });
  });
});

describe('matchesSpaceRule', () => {
  test('keyword in the title', () => {
    expect(matchesSpaceRule(insight('Paid Swiggy'), { keywords: ['swiggy'] })).toBe(true);
  });
  test('keyword in an entity value', () => {
    expect(matchesSpaceRule(insight('Paid merchant', '', { merchant: 'Zomato' }), { keywords: ['zomato'] })).toBe(true);
  });
  test('sender match, case-insensitive, substring', () => {
    expect(matchesSpaceRule(insight('Bill'), { senders: ['hdfcbk'] }, { sender: 'VM-HDFCBK' })).toBe(true);
    expect(matchesSpaceRule(insight('Bill'), { senders: ['hdfcbk'] }, { sender: 'AD-ICICIB' })).toBe(false);
  });
  test('no criteria never matches', () => {
    expect(matchesSpaceRule(insight('anything'), {})).toBe(false);
  });
});

describe('routeToSpace', () => {
  const spaces = [
    { key: 'pets', rule: { keywords: ['vet', 'pawpals'] } },
    { key: 'food', rule: { keywords: ['swiggy', 'zomato'] } },
    { key: 'label_only', rule: null },
  ];
  test('first matching space wins', () => {
    expect(routeToSpace(insight('Paid Swiggy'), spaces)).toBe('food');
    expect(routeToSpace(insight('Vet appointment'), spaces)).toBe('pets');
  });
  test('no match leaves the model’s category alone', () => {
    expect(routeToSpace(insight('Salary from Acme'), spaces)).toBeNull();
  });
  test('a space with no rule can never claim anything', () => {
    expect(routeToSpace(insight('label_only'), [{ key: 'label_only', rule: null }])).toBeNull();
  });
});
