import { z } from 'zod';
import type { SignalCategory } from '../needle/NeedleEngine';
import { parseLooseDate, parseLooseTime } from '../../utils/dates';

// ─── 1. Finance Schemas ────────────────────────────────────────────────────────

export const ExpenseSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.string().default('INR'),
  merchant: z.string().min(1),
  category: z.string().optional().default('other'),
  account_tail: z.string().optional(),
});

export const IncomeSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.string().default('INR'),
  source: z.string().min(1),
  type: z.string().optional().default('credit'),
});

// ─── 2. Bill Reminder Schema ──────────────────────────────────────────────────

export const BillReminderSchema = z.object({
  bill_type: z.string().default('other'),
  amount_due: z.coerce.number().optional(),
  due_date: z.string().min(1),
  biller_name: z.string().optional(),
});

// ─── Enum wording, as a model actually writes it ──────────────────────────────

/**
 * The three enum fields below name a *state*, and the model is told what the
 * states are by example ("shipped, out_for_delivery, delivered"). A 350M model
 * given that prompt writes "Out for Delivery", "in transit", "dispatched" — all
 * of which mean the state we asked for, and none of which is the literal token.
 *
 * `z.enum(...).default(x)` is unforgiving about the difference: a default fills
 * in for a field that is *absent*, never for one that is present and unmatched,
 * so an unrecognised word failed the whole schema. That took the card, and with
 * it the message — `validation_failed` marks the signal filtered out for good.
 *
 * So each of these is normalised before it is matched. What is *not* relaxed
 * is the other half of the rule, which `validator.test.ts` pins: a word we do
 * not recognise at all — "teleported" — is still passed through unchanged and
 * still fails, because a status invented to save a card is worse than no card.
 * The vocabulary does not change; only the tolerance for how it is spelled.
 */
function canonical(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return key || null;
}

/**
 * Builds a preprocessor that maps loose wording onto one of `synonyms`' values.
 * An unmapped word is returned untouched, so the enum rejects it as before.
 */
function looseEnum(synonyms: Record<string, string>) {
  return (value: unknown): unknown => {
    const key = canonical(value);
    if (key === null) return value;
    return synonyms[key] ?? value;
  };
}

const DELIVERY_STATUS: Record<string, string> = {
  ordered: 'ordered', order_placed: 'ordered', placed: 'ordered', confirmed: 'ordered',
  shipped: 'shipped', dispatched: 'shipped', in_transit: 'shipped', transit: 'shipped',
  on_the_way: 'shipped', shipping: 'shipped', picked_up: 'shipped',
  out_for_delivery: 'out_for_delivery', ofd: 'out_for_delivery',
  arriving_today: 'out_for_delivery', arriving: 'out_for_delivery',
  delivered: 'delivered', completed: 'delivered', complete: 'delivered',
  failed: 'failed', delivery_failed: 'failed', undelivered: 'failed', missed: 'failed',
  returned: 'returned', return: 'returned', returning: 'returned', rto: 'returned',
};

const TRANSPORT_TYPE: Record<string, string> = {
  flight: 'flight', air: 'flight', plane: 'flight', airline: 'flight', aeroplane: 'flight',
  train: 'train', rail: 'train', railway: 'train', irctc: 'train',
  bus: 'bus', coach: 'bus',
  cab: 'cab', taxi: 'cab', car: 'cab', ride: 'cab', auto: 'cab',
  hotel: 'hotel', stay: 'hotel', room: 'hotel', accommodation: 'hotel',
};

const URGENCY: Record<string, string> = {
  low: 'low', minor: 'low',
  medium: 'medium', med: 'medium', normal: 'medium', moderate: 'medium',
  high: 'high', urgent: 'high', critical: 'high', important: 'high',
};

// ─── 3. Delivery Schema ───────────────────────────────────────────────────────

export const DeliverySchema = z.object({
  provider: z.string().min(1),
  status: z.preprocess(
    looseEnum(DELIVERY_STATUS),
    z
      .enum(['ordered', 'shipped', 'out_for_delivery', 'delivered', 'failed', 'returned'])
      .default('shipped'),
  ),
  tracking_id: z.string().optional(),
  otp: z.string().optional(),
  estimated_arrival: z.string().optional(),
});

// ─── 4. Travel Booking Schema ─────────────────────────────────────────────────

export const TravelBookingSchema = z.object({
  transport_type: z.preprocess(
    looseEnum(TRANSPORT_TYPE),
    z.enum(['flight', 'train', 'bus', 'cab', 'hotel']).default('flight'),
  ),
  booking_id: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  departure_time: z.string().optional(),
  arrival_time: z.string().optional(),
});

// ─── 5. Task Reminder Schema ──────────────────────────────────────────────────

export const TaskReminderSchema = z.object({
  title: z.string().min(1),
  deadline: z.string().optional(),
  urgency: z.preprocess(
    looseEnum(URGENCY),
    z.enum(['low', 'medium', 'high']).default('medium'),
  ),
});

// ─── Canonical entities ───────────────────────────────────────────────────────

/**
 * What every screen reads, whichever tool produced the insight.
 *
 * The six tool schemas above are the model's vocabulary and they are not
 * consistent with each other — a bill has a `due_date`, a task a `deadline`,
 * a delivery an `estimated_arrival` — and none of them is a date the runtime
 * can compare. The cards, the urgency ramp, the digest and the reminders all
 * need one answer to "when is this", "who is this from" and "how much", so
 * those three are written once here under fixed names, alongside the raw
 * fields the tool returned.
 *
 * The raw fields stay. Nothing is lost by adding a canonical layer on top,
 * and the detail screen can still show exactly what was extracted.
 */
export interface CanonicalEntities {
  /** Who it is from: the merchant, biller, provider, sender — best available. */
  entity?: string;
  /** The day it turns on, `YYYY-MM-DD`. Bills, tasks, travel. */
  dueDate?: string;
  /** Travel: the day it happens. Same value as `dueDate`, kept for readers that ask by that name. */
  date?: string;
  /** Delivery: the day it arrives. */
  eta?: string;
  /** A clock time on that day, when the message had one. */
  time?: { hour: number; minute: number };
  amount?: number;
  /** A symbol, never a code. The UI prints it directly in front of the figure. */
  currency?: string;
  [key: string]: unknown;
}

export interface ValidatedInsightData {
  category: SignalCategory;
  title: string;
  summary: string;
  entities: CanonicalEntities;
  confidence: number;
}

/**
 * What the pipeline knows that the model was not shown.
 *
 * The sender is the single most reliable "who" there is — the model can
 * misread a merchant, but the DLT header on a bank SMS is the bank — and the
 * arrival time is what makes "tomorrow" mean something.
 */
export interface ValidationContext {
  sender?: string | null;
  packageName?: string | null;
  receivedAt?: number;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  inr: '₹', rs: '₹', 'rs.': '₹', rupees: '₹', '₹': '₹',
  usd: '$', '$': '$',
  eur: '€', '€': '€',
  gbp: '£', '£': '£',
  aed: 'AED ', sgd: 'S$', jpy: '¥',
};

function currencySymbol(code: string | undefined): string {
  if (!code) return '₹';
  const key = code.trim().toLowerCase();
  return CURRENCY_SYMBOL[key] ?? `${code.trim().toUpperCase()} `;
}

/**
 * DLT sender headers, as people know them.
 *
 * Indian transactional SMS arrive from six-letter ids like `HDFCBK`, often
 * prefixed with a two-letter route (`VM-HDFCBK`, `AD-ICICIB`). Showing that
 * on a card is showing the plumbing. This is the short list that covers the
 * bulk of what a phone in India actually receives; anything else falls back
 * to the id with the route stripped, which is still better than nothing.
 */
const SENDER_NAMES: Record<string, string> = {
  hdfcbk: 'HDFC Bank', icicib: 'ICICI Bank', sbiinb: 'SBI', sbipsg: 'SBI', axisbk: 'Axis Bank',
  kotakb: 'Kotak', indusb: 'IndusInd', yesbnk: 'Yes Bank', pnbsms: 'PNB', bobtxn: 'Bank of Baroda',
  canbnk: 'Canara Bank', idfcfb: 'IDFC First', aubank: 'AU Bank', fedbnk: 'Federal Bank',
  paytmb: 'Paytm', phonpe: 'PhonePe', gpay: 'Google Pay', amazon: 'Amazon', amznin: 'Amazon',
  flpkrt: 'Flipkart', flipkt: 'Flipkart', swiggy: 'Swiggy', zomato: 'Zomato', myntra: 'Myntra',
  airtel: 'Airtel', jiocare: 'Jio', jioinf: 'Jio', vicare: 'Vi', bsnlin: 'BSNL',
  indigo: 'IndiGo', airind: 'Air India', spicej: 'SpiceJet', akasaa: 'Akasa', irctci: 'IRCTC',
  irctc: 'IRCTC', mmtrip: 'MakeMyTrip', goibib: 'Goibibo', redbus: 'redBus', olacab: 'Ola',
  uberin: 'Uber', bluedt: 'Bluedart', dtdcin: 'DTDC', delhiv: 'Delhivery', ekartl: 'Ekart',
  bescom: 'BESCOM', tneb: 'TNEB', msedcl: 'MSEDCL', bsesdl: 'BSES', tatapw: 'Tata Power',
  licind: 'LIC', hdfclf: 'HDFC Life', icicpr: 'ICICI Pru', cred: 'CRED', credcl: 'CRED',
};

export function prettySender(sender: string | null | undefined): string | undefined {
  if (!sender) return undefined;
  const raw = sender.trim();
  if (!raw) return undefined;
  // A phone number is not a name.
  if (/^\+?\d[\d\s-]{6,}$/.test(raw)) return undefined;
  // `VM-HDFCBK`, `AD-ICICIB-S`: drop the route prefix and any trailing suffix.
  const core = raw.replace(/^[a-z]{2}-/i, '').replace(/-[a-z]$/i, '').trim();
  const known = SENDER_NAMES[core.toLowerCase()];
  if (known) return known;
  return core || undefined;
}

/**
 * "SWIGGY" → "Swiggy", "ACME TECHNOLOGIES PVT LTD" → "ACME Technologies PVT LTD".
 *
 * Bank messages shout. Un-shouting a merchant name is easy; un-shouting a
 * whole line without wrecking its acronyms is not, and this app's world is
 * full of them — HDFC, SBI, LIC, UPI, PVT, LTD. The rule: a word of five or
 * more letters written in capitals is being shouted and gets a capital and
 * lowercase; a word of four or fewer is assumed to be an acronym and is left
 * alone. "ACME" stays ACME; better that than "Hdfc".
 */
const titleCase = (s: string) =>
  s
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length >= 5 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w))
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

const clock = (t: { hour: number; minute: number }) =>
  `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;

/**
 * Turn a tool call into an insight, or refuse.
 *
 * Two jobs. The Zod schemas reject a call whose required fields are missing
 * or malformed — that is the "never guess" half of the system prompt made
 * enforceable. Then every branch writes the canonical layer, so an insight
 * from any tool can be sorted, coloured, scheduled and summarised without the
 * reader knowing which tool it came from.
 */
/**
 * "1,240.00", "Rs 799", "₹8,420" → a number the schema will accept.
 *
 * The normaliser strips these before the engine sees the text, but a model
 * copies what it was trained on and will happily hand back the comma form.
 * `z.coerce.number("1,240")` is `NaN`, and `NaN` failed the whole card.
 */
export function coerceAmount(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const cleaned = value.replace(/[^\d.\-]/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '-') return value;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : value;
}

const AMOUNT_KEYS = ['amount', 'amount_due'];

function withCleanAmounts(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  for (const key of AMOUNT_KEYS) {
    if (key in out) out[key] = coerceAmount(out[key]);
  }
  return out;
}

export function validateAndFormatInsight(
  toolName: string,
  incomingArgs: Record<string, unknown>,
  confidence: number,
  context: ValidationContext = {},
): ValidatedInsightData | null {
  const ref = context.receivedAt ? new Date(context.receivedAt) : new Date();
  const fromSender = prettySender(context.sender);
  const rawArgs = withCleanAmounts(incomingArgs ?? {});

  try {
    switch (toolName) {
      case 'create_expense': {
        const data = ExpenseSchema.parse(rawArgs);
        const symbol = currencySymbol(data.currency);
        const merchant = titleCase(data.merchant);
        return {
          category: 'finance',
          title: `Paid ${merchant}`,
          summary: data.account_tail
            ? `From account ••${data.account_tail.replace(/\D/g, '').slice(-4)}`
            : fromSender
              ? `Debited · ${fromSender}`
              : 'Debited',
          entities: {
            ...data,
            entity: merchant,
            amount: data.amount,
            currency: symbol,
            direction: 'out',
          },
          confidence,
        };
      }

      case 'create_income': {
        const data = IncomeSchema.parse(rawArgs);
        const symbol = currencySymbol(data.currency);
        const source = titleCase(data.source);
        const kind = data.type.toLowerCase();
        const verb =
          kind.includes('salary') ? 'Salary' :
          kind.includes('refund') ? 'Refund' :
          kind.includes('cashback') ? 'Cashback' :
          kind.includes('interest') ? 'Interest' :
          'Credit';
        return {
          category: 'finance',
          title: `${verb} from ${source}`,
          summary: fromSender ? `Credited · ${fromSender}` : 'Credited',
          entities: {
            ...data,
            entity: source,
            amount: data.amount,
            currency: symbol,
            direction: 'in',
          },
          confidence,
        };
      }

      case 'create_bill_reminder': {
        const data = BillReminderSchema.parse(rawArgs);
        const dueDate = parseLooseDate(data.due_date, ref);
        const biller = data.biller_name ? titleCase(data.biller_name) : fromSender;
        const billType = titleCase(data.bill_type).toLowerCase();
        const noun = /bill|due|payment|emi|premium|rent/.test(billType) ? billType : `${billType} bill`;
        return {
          category: 'bill',
          title: biller ? `${biller} ${noun}` : titleCase(noun),
          // The card's own urgency line says "Due tomorrow"; this is what
          // remains when the date could not be read.
          summary: dueDate ? 'Payment due' : `Due ${data.due_date}`,
          entities: {
            ...data,
            entity: biller,
            amount: data.amount_due,
            currency: '₹',
            ...(dueDate ? { dueDate } : {}),
          },
          confidence,
        };
      }

      case 'track_delivery': {
        const data = DeliverySchema.parse(rawArgs);
        const provider = titleCase(data.provider);
        const eta = parseLooseDate(data.estimated_arrival, ref);
        const time = parseLooseTime(data.estimated_arrival);
        const statusPhrase: Record<typeof data.status, string> = {
          ordered: 'order placed',
          shipped: 'order shipped',
          out_for_delivery: 'out for delivery',
          delivered: 'delivered',
          failed: 'delivery failed',
          returned: 'returned',
        };
        return {
          category: 'delivery',
          title: `${provider} ${statusPhrase[data.status]}`,
          summary: data.otp
            ? `Delivery OTP ${data.otp}`
            : data.tracking_id
              ? `Tracking ${data.tracking_id}`
              : 'Package update',
          entities: {
            ...data,
            entity: provider,
            ...(eta ? { eta, dueDate: eta } : {}),
            ...(time ? { time } : {}),
          },
          confidence,
        };
      }

      case 'create_travel_booking': {
        const data = TravelBookingSchema.parse(rawArgs);
        const date = parseLooseDate(data.departure_time, ref);
        const time = parseLooseTime(data.departure_time);
        const kind = titleCase(data.transport_type);
        const route =
          data.origin && data.destination
            ? `${data.origin.trim()} → ${data.destination.trim()}`
            : data.destination
              ? `to ${data.destination.trim()}`
              : null;
        return {
          category: 'travel',
          title: route ? `${kind} ${route}` : `${kind} booking`,
          summary: data.booking_id
            ? `PNR ${data.booking_id}${time ? ` · departs ${clock(time)}` : ''}`
            : time
              ? `Departs ${clock(time)}`
              : fromSender ?? 'Booking confirmed',
          entities: {
            ...data,
            entity: fromSender ?? kind,
            ...(date ? { date, dueDate: date } : {}),
            ...(time ? { time } : {}),
            ...(route ? { location: route } : {}),
          },
          confidence,
        };
      }

      case 'create_task_reminder': {
        const data = TaskReminderSchema.parse(rawArgs);
        const dueDate = parseLooseDate(data.deadline, ref);
        const time = parseLooseTime(data.deadline);
        return {
          category: 'task',
          title: data.title.trim(),
          summary: dueDate
            ? 'Deadline'
            : data.deadline
              ? `By ${data.deadline}`
              : `${titleCase(data.urgency)} priority`,
          entities: {
            ...data,
            entity: fromSender,
            ...(dueDate ? { dueDate } : {}),
            ...(time ? { time } : {}),
          },
          confidence,
        };
      }

      default:
        return null;
    }
  } catch (err) {
    console.warn(`[InsightValidator] Validation failed for tool ${toolName}:`, err);
    return null;
  }
}

/** Convenience for readers that only have the JSON column. */
export function parseEntities(entitiesJson: string): CanonicalEntities {
  try {
    return JSON.parse(entitiesJson) as CanonicalEntities;
  } catch {
    return {};
  }
}

/** "₹8,420" — the one way an amount is printed anywhere in the app. */
export function formatAmount(amount: number, symbol = '₹'): string {
  return `${symbol}${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
