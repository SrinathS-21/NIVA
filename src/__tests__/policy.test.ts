import { suggestPolicy, entityKey, REPEAT_THRESHOLD } from '../core/policy/PolicySuggestions';
import type { ActionWithInsight } from '../db/repositories/actions';
import type { Watch } from '../db/repositories/watches';

const NOW = new Date(2026, 8, 2, 10, 0).getTime();
let n = 0;
function act(
  action_type: ActionWithInsight['action_type'],
  category: string,
  entity: string,
  daysAgo = 1,
): ActionWithInsight {
  n += 1;
  return {
    id: `a${n}`,
    insight_id: `i${n}`,
    action_type,
    payload_json: '{"via":"user"}',
    executed_at: NOW - daysAgo * 24 * 3600 * 1000,
    category,
    title: entity,
    entities_json: JSON.stringify({ entity, amount: 100 }),
  };
}

describe('entityKey', () => {
  test('normalises', () => {
    expect(entityKey('Swiggy')).toBe('swiggy');
    expect(entityKey('HDFC Bank')).toBe('hdfc bank');
    expect(entityKey('  Z-Mart!! ')).toBe('z mart');
    expect(entityKey('ab')).toBeNull();
    expect(entityKey(undefined)).toBeNull();
  });
});

describe('suggestPolicy', () => {
  test('nothing below the threshold', () => {
    const h = [act('track', 'finance', 'Swiggy'), act('track', 'finance', 'Swiggy')];
    expect(suggestPolicy(h, [], new Set(), NOW)).toBeNull();
  });

  test('three identical tracks → "Always track Swiggy payments?"', () => {
    const h = Array.from({ length: REPEAT_THRESHOLD }, () => act('track', 'finance', 'Swiggy'));
    const s = suggestPolicy(h, [], new Set(), NOW);
    expect(s).not.toBeNull();
    expect(s!.key).toBe('always:track:finance:swiggy');
    expect(s!.title).toBe('Always track Swiggy payments?');
    expect(s!.watch).toMatchObject({
      category: 'finance',
      action_type: 'track',
      trigger: { category: 'finance', merchants: ['swiggy'] },
    });
  });

  test('ignoring the same sender is offered as a negative rule', () => {
    const h = [act('ignore', 'finance', 'Myntra'), act('ignore', 'finance', 'Myntra'), act('ignore', 'finance', 'Myntra')];
    const s = suggestPolicy(h, [], new Set(), NOW);
    expect(s!.title).toBe('Always ignore Myntra payments?');
    expect(s!.watch.action_type).toBe('ignore');
  });

  test('the most repeated pattern wins', () => {
    const h = [
      ...Array.from({ length: 3 }, () => act('track', 'finance', 'Swiggy')),
      ...Array.from({ length: 5 }, () => act('ignore', 'delivery', 'Amazon')),
    ];
    expect(suggestPolicy(h, [], new Set(), NOW)!.key).toBe('always:ignore:delivery:amazon');
  });

  test('a dismissed offer is never repeated', () => {
    const h = Array.from({ length: 3 }, () => act('track', 'finance', 'Swiggy'));
    expect(suggestPolicy(h, [], new Set(['always:track:finance:swiggy']), NOW)).toBeNull();
  });

  test('an existing watch that already covers it suppresses the offer', () => {
    const h = Array.from({ length: 3 }, () => act('track', 'finance', 'Swiggy'));
    const w: Watch = {
      id: 'w', title: 'Food', description: null, category: 'finance', action_type: 'track',
      trigger_json: JSON.stringify({ category: 'finance', merchants: ['swiggy'] }),
      enabled: 1, created_at: 0, handled_count: 0,
    };
    expect(suggestPolicy(h, [w], new Set(), NOW)).toBeNull();
    // A paused watch does not count.
    expect(suggestPolicy(h, [{ ...w, enabled: 0 }], new Set(), NOW)).not.toBeNull();
  });

  test('old behaviour is not a pattern', () => {
    const h = Array.from({ length: 3 }, () => act('track', 'finance', 'Swiggy', 90));
    expect(suggestPolicy(h, [], new Set(), NOW)).toBeNull();
  });

  test('calendar actions are not suggested (they need the dialog)', () => {
    const h = Array.from({ length: 3 }, () => act('calendar', 'travel', 'IndiGo'));
    expect(suggestPolicy(h, [], new Set(), NOW)).toBeNull();
  });
});
