/**
 * NIVA mock data — realistic Indian scenarios.
 *
 * Seed content so the card UI can be judged before real notifications arrive.
 * Every insight maps to a real Signal → Insight → Action pipeline.
 *
 * ── Dates are relative, never literal ───────────────────────────────────────
 * These used to carry fixed ISO dates, which meant the whole set aged into
 * "overdue" a few days after it was written and the urgency ramp could never
 * be seen. Everything below is computed from today, so the set always covers
 * every level: overdue, today, soon, ample, and no-deadline.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `n` days ago as a timestamp. Fractional days are fine. */
const daysAgo = (d: number, hoursAgo = 0) => Date.now() - d * DAY_MS - hoursAgo * 60 * 60 * 1000;

/** `n` days from today as `YYYY-MM-DD`. Negative is the past. */
function inDays(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Master switch for demo content.
 *
 * ON for design review. While it is on, every screen falls back to mock data
 * whenever the database comes back empty — which also means a real user with
 * no signals yet sees a fake inbox and never reaches the empty states written
 * for them. Turn it off before shipping.
 */
export const USE_MOCK_DATA = true;

type Entities = Record<string, unknown>;

function insight(
  id: string,
  category: 'finance' | 'bill' | 'delivery' | 'travel' | 'task',
  title: string,
  summary: string,
  entities: Entities,
  confidence: number,
  createdAt: number,
) {
  return {
    id,
    signal_id: `sig-${id}`,
    title,
    summary,
    category,
    confidence,
    status: 'inbox',
    entities_json: JSON.stringify(entities),
    created_at: createdAt,
    actioned_at: null,
  };
}

// ── Mock insights (Inbox) ────────────────────────────────────────────────────
/**
 * Ordered deliberately so a scroll walks the whole urgency ramp: two overdue,
 * then today, then the near ones, then the comfortable ones, then the purely
 * informational. Long titles, big and small amounts, and one of every space
 * are all in here on purpose — those are the cases that break a card layout.
 */
export const MOCK_INSIGHTS = [
  // ── Overdue — red ─────────────────────────────────────────────────────────
  insight(
    'mock-1', 'bill',
    'HDFC Credit Card payment',
    'Minimum due has already passed',
    { entity: 'HDFC Bank', amount: 8420, currency: '₹', dueDate: inDays(-3) },
    0.96, daysAgo(3, 2),
  ),
  insight(
    'mock-2', 'task',
    'You promised Anjali the revised proposal',
    'Said "by Monday" in the thread',
    { entity: 'Gmail', dueDate: inDays(-1) },
    0.81, daysAgo(1, 6),
  ),

  // ── Today — orange ────────────────────────────────────────────────────────
  insight(
    'mock-3', 'bill',
    'BESCOM electricity bill',
    'Last day before the late fee',
    { entity: 'BESCOM', amount: 2310, currency: '₹', dueDate: inDays(0) },
    0.94, daysAgo(0, 4),
  ),
  insight(
    'mock-4', 'travel',
    'Interview — TCS, Round 2',
    'Google Meet link in the invite',
    { entity: 'Google Calendar', date: inDays(0), location: 'Google Meet' },
    0.91, daysAgo(0, 9),
  ),

  // ── Soon, 1-3 days — amber ────────────────────────────────────────────────
  insight(
    'mock-5', 'delivery',
    'Boat Airdopes 141 out for delivery',
    'Bluedart · 1 of 2 items',
    { entity: 'Flipkart', eta: inDays(1), courier: 'Bluedart' },
    0.89, daysAgo(0, 2),
  ),
  insight(
    'mock-6', 'bill',
    'Airtel postpaid bill',
    'Autopay is off for this number',
    { entity: 'Airtel', amount: 799, currency: '₹', dueDate: inDays(2) },
    0.92, daysAgo(0, 7),
  ),
  insight(
    'mock-7', 'task',
    'Submit the rent agreement scan to the society office',
    'Asked twice in the WhatsApp group',
    { entity: 'WhatsApp', dueDate: inDays(3) },
    0.72, daysAgo(1, 1),
  ),

  // ── Ample, 4+ days — green ────────────────────────────────────────────────
  insight(
    'mock-8', 'bill',
    'LIC premium',
    'Quarterly, auto-debit not set up',
    { entity: 'LIC India', amount: 18450, currency: '₹', dueDate: inDays(9) },
    0.88, daysAgo(2, 3),
  ),
  insight(
    'mock-9', 'travel',
    'Flight to Delhi — 6E 2043',
    'Web check-in opens 48h before',
    { entity: 'IndiGo', date: inDays(12), location: 'BLR → DEL' },
    0.95, daysAgo(2, 8),
  ),
  insight(
    'mock-10', 'bill',
    'Apartment maintenance',
    'Same amount as last quarter',
    { entity: 'MyGate', amount: 4200, currency: '₹', dueDate: inDays(21) },
    0.86, daysAgo(3, 2),
  ),

  // ── No deadline — neutral, no colour ──────────────────────────────────────
  insight(
    'mock-11', 'finance',
    'Salary credited',
    'ICICI Bank · August',
    { entity: 'ICICI Bank', amount: 184200, currency: '₹' },
    0.98, daysAgo(0, 11),
  ),
  insight(
    'mock-12', 'finance',
    'Swiggy — ₹1,240 spent this week',
    'Up from ₹680 last week',
    { entity: 'Swiggy', amount: 1240, currency: '₹' },
    0.83, daysAgo(0, 3),
  ),
  insight(
    'mock-13', 'finance',
    'Refund received from Amazon',
    'Order cancelled on 12 Aug',
    { entity: 'Amazon', amount: 2799, currency: '₹' },
    0.93, daysAgo(1, 4),
  ),
  insight(
    'mock-14', 'delivery',
    'Order delivered — Prestige induction cooktop',
    'Left with the security desk',
    { entity: 'Amazon', courier: 'Amazon Logistics' },
    0.90, daysAgo(1, 9),
  ),
  insight(
    'mock-15', 'task',
    'Renew the car insurance before the policy lapses',
    'No date found in the reminder',
    { entity: 'SMS · ACKO' },
    0.64, daysAgo(2, 5),
  ),
];

export const MOCK_WATCHES = [
  {
    id: 'watch-1',
    title: 'Food spending on Swiggy & Zomato',
    category: 'finance',
    action_type: 'track',
    trigger_json: JSON.stringify({ merchants: ['Swiggy', 'Zomato', 'Restaurants'] }),
    enabled: 1,
    handled_count: 12,
    created_at: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'watch-2',
    title: 'Credit card bills — remind 3 days before',
    category: 'bill',
    action_type: 'remind',
    trigger_json: JSON.stringify({ daysBefore: 3 }),
    enabled: 1,
    handled_count: 3,
    created_at: Date.now() - 14 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'watch-3',
    title: 'College deadlines — never miss them',
    category: 'task',
    action_type: 'calendar',
    trigger_json: JSON.stringify({ keywords: ['deadline', 'submission', 'due'] }),
    enabled: 0,
    handled_count: 5,
    created_at: Date.now() - 30 * 24 * 60 * 60 * 1000,
  },
];

// ── Mock Activity Feed ───────────────────────────────────────────────────────
export const MOCK_ACTIVITY = [
  { id: 'act-1', time: '12:42 PM', action: 'Detected HDFC payment due', result: 'You tracked it', date: 'today' },
  { id: 'act-2', time: '11:20 AM', action: 'Detected Swiggy expense ₹420', result: 'Handled automatically by Watch', date: 'today' },
  { id: 'act-3', time: '09:12 AM', action: 'Detected interview with TCS', result: 'Added to Calendar', date: 'today' },
  { id: 'act-4', time: '6:32 PM', action: 'Detected Zomato expense ₹680', result: 'Ignored', date: 'yesterday' },
  { id: 'act-5', time: '3:15 PM', action: 'Detected Flipkart delivery', result: 'Tracked as delivery', date: 'yesterday' },
  { id: 'act-6', time: '10:00 AM', action: 'Detected Airtel bill ₹799', result: 'Reminder scheduled for Aug 24', date: 'yesterday' },
];

// ── Greeting based on time of day ────────────────────────────────────────────
export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Time ago helper ──────────────────────────────────────────────────────────
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
