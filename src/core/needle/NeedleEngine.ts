import { CactusLM, type CactusLMMessage, type CactusLMTool } from 'cactus-react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalCategory =
  | 'finance'
  | 'bill'
  | 'delivery'
  | 'travel'
  | 'task'
  | 'noise';

export interface NeedleResult {
  category: SignalCategory;
  toolName: string;
  arguments: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

// ─── Tool Schemas (passed to Needle as function definitions) ──────────────────

const NEEDLE_TOOLS: CactusLMTool[] = [
  {
    name: 'create_expense',
    description:
      'Called when a debit, spending, or payment is made from a bank account or card. Includes UPI payments, card transactions, ATM withdrawals.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Transaction amount as a positive number' },
        currency: { type: 'string', description: 'Currency code e.g. INR, USD' },
        merchant: { type: 'string', description: 'Merchant or payee name' },
        category: { type: 'string', description: 'Expense category e.g. food, transport, bills' },
        account_tail: { type: 'string', description: 'Last 4 digits of the account/card, if mentioned' },
      },
      required: ['amount', 'merchant'],
    },
  },
  {
    name: 'create_income',
    description:
      'Called when money is credited to a bank account — salary, refund, cashback, bank interest, or any inbound transfer.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount credited' },
        currency: { type: 'string', description: 'Currency code e.g. INR' },
        source: { type: 'string', description: 'Source of income e.g. employer name, NEFT sender' },
        type: { type: 'string', description: 'Income type e.g. salary, refund' },
      },
      required: ['amount', 'source'],
    },
  },
  {
    name: 'create_bill_reminder',
    description:
      'Called when a bill, utility payment, or subscription due date is mentioned. Electricity, gas, broadband, credit card bill, rent, EMI.',
    parameters: {
      type: 'object',
      properties: {
        bill_type: { type: 'string', description: 'Type of bill e.g. electricity, credit_card' },
        amount_due: { type: 'number', description: 'Amount due' },
        due_date: { type: 'string', description: 'Due date exactly as written in the message, e.g. "24-08" or "25th August"' },
        biller_name: { type: 'string', description: 'Biller or provider name' },
      },
      required: ['bill_type', 'due_date'],
    },
  },
  {
    name: 'track_delivery',
    description:
      'Called when an order has been shipped, is out for delivery, or has been delivered. Amazon, Flipkart, Swiggy, Zomato, Bluedart, DTDC, FedEx, etc.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Delivery service name e.g. Amazon, Swiggy' },
        status: { type: 'string', description: 'Status e.g. shipped, out_for_delivery, delivered' },
        tracking_id: { type: 'string', description: 'Tracking or AWB number' },
        otp: { type: 'string', description: 'Delivery OTP if present in the message' },
        estimated_arrival: { type: 'string', description: 'Estimated arrival date or time exactly as written' },
      },
      required: ['provider', 'status'],
    },
  },
  {
    name: 'create_travel_booking',
    description:
      'Called when a flight, train, bus, cab, or hotel booking is confirmed. Includes PNR numbers, boarding passes, and cab booking confirmations.',
    parameters: {
      type: 'object',
      properties: {
        transport_type: { type: 'string', description: 'Type e.g. flight, train, cab, hotel' },
        booking_id: { type: 'string', description: 'Booking ID, PNR, or confirmation number' },
        origin: { type: 'string', description: 'Departure location' },
        destination: { type: 'string', description: 'Arrival location' },
        departure_time: { type: 'string', description: 'Departure date and time exactly as written' },
        arrival_time: { type: 'string', description: 'Arrival time' },
      },
      required: ['transport_type'],
    },
  },
  {
    name: 'create_task_reminder',
    description:
      'Called for appointment reminders, calendar events, or actionable personal tasks with a deadline.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task or event title' },
        deadline: { type: 'string', description: 'Date and time of the task exactly as written' },
        urgency: { type: 'string', description: 'low, medium, or high' },
      },
      required: ['title'],
    },
  },
];

/**
 * The line between Auto and Review. Mirrors the inbox and the watch matcher,
 * which both split at this value.
 */
export const CONFIDENCE_GATE = 0.85;

/**
 * A confidence the rest of the app can trust.
 *
 * When the runtime scores the call, that score wins. When it does not — an
 * older weight build, a tool-only completion path that skips scoring — a
 * constant would be dishonest in either direction, so this reads the two
 * signals that are always present: whether the runtime itself flagged the
 * result as weak, and whether the call actually filled in the fields the tool
 * marks as required. A call that names an expense but not its amount is a
 * guess, however sure the model sounded.
 */
export function resolveConfidence(
  reported: number | undefined,
  weak: boolean | undefined,
  call: { name: string; arguments: Record<string, unknown> },
): number {
  if (typeof reported === 'number' && Number.isFinite(reported)) {
    return Math.max(0, Math.min(1, reported));
  }
  let score = 0.9;
  if (weak) score -= 0.2;
  const spec = NEEDLE_TOOLS.find((t) => t.name === call.name);
  const missing =
    spec?.parameters.required.filter((k) => {
      const v = call.arguments?.[k];
      return v === undefined || v === null || v === '';
    }).length ?? 0;
  score -= missing * 0.15;
  return Math.max(0.3, Math.min(1, score));
}

// ─── System Prompt ────────────────────────────────────────────────────────────
// Dates are asked for verbatim on purpose. Converting "24-08" to a real date
// is deterministic work (see utils/dates), and a 350M-parameter model asked
// to do it is a model asked to invent a year.
const NEEDLE_SYSTEM_PROMPT = `You are a precise event classification agent.
Analyze the incoming message and call the single most appropriate tool.
Extract all relevant entities accurately.
Copy dates and times exactly as written in the message — do not convert or reformat them.
If no tool applies (promotional spam, OTP, social notification), respond with: {"is_noise": true}
Never guess — if an entity is absent from the message, omit it.`;

// ─── Needle Engine Singleton ──────────────────────────────────────────────────

class NeedleEngineClass {
  private lm: CactusLM | null = null;

  /**
   * Points the classifier at a prepared engine. ModelManager owns the
   * download and warm-up; this only swaps in the live instance, so changing
   * the Niva version takes effect from the next classify() onwards.
   */
  setEngine(lm: CactusLM): void {
    this.lm = lm;
  }

  async classify(rawText: string): Promise<NeedleResult | null> {
    if (!this.lm) {
      throw new Error('NeedleEngine has no engine loaded yet.');
    }

    const messages: CactusLMMessage[] = [
      { role: 'system', content: NEEDLE_SYSTEM_PROMPT },
      { role: 'user', content: rawText },
    ];

    const result = await this.lm.complete({
      messages,
      options: {
        temperature: 0.0,
        /**
         * Off, and it has to be said explicitly: the runtime defaults it on,
         * and the native library links libcurl with two endpoints baked in.
         * A product whose whole pitch is that messages never leave the phone
         * cannot ship an inference engine that reports home per request.
         */
        telemetryEnabled: false,
        /**
         * What makes `result.confidence` real.
         *
         * The runtime only scores a completion when asked to, by giving it a
         * threshold. Without this every call came back with no confidence at
         * all, the fallback made it a constant, and the Auto/Review split in
         * the inbox — the app's whole stance on trust — was inert.
         *
         * The threshold is also the runtime's cue for a `cloudHandoff` hint.
         * That is a boolean in the result and nothing more: this SDK has no
         * cloud call and no endpoint to make one to, so a low score is a flag
         * we read, never a request that leaves the device.
         */
        confidenceThreshold: CONFIDENCE_GATE,
      },
      tools: NEEDLE_TOOLS,
    });

    /**
     * A completion that failed is not a message about nothing.
     *
     * The runtime reports a failed inference as `success: false` with an empty
     * response rather than by throwing — which, read as "no tool call", is
     * indistinguishable here from "this is promotional noise". The pipeline
     * then marks the signal `filtered_out` and it is never looked at again, so
     * one runtime hiccup permanently loses a real bank alert. Throwing hands it
     * to the caller's `classification_failed` branch instead, which leaves the
     * signal `pending` for the next foreground to retry.
     */
    if (result.success === false) {
      throw new Error('Engine reported a failed completion');
    }

    if (result.functionCalls && result.functionCalls.length > 0) {
      const call = result.functionCalls[0];
      return {
        category: toolNameToCategory(call.name),
        toolName: call.name,
        arguments: call.arguments,
        confidence: resolveConfidence(result.confidence, result.cloudHandoff, call),
        reasoning: result.thinking ?? '',
      };
    }

    const text = result.response?.trim();

    // Try parsing as noise signal manually if it didn't trigger a tool
    if (text?.includes('"is_noise": true') || text?.includes('"is_noise":true')) {
      return null;
    }

    return null; // No function call and not noise, discard
  }

  /**
   * Read a watch sentence into its parts.
   *
   * The same engine, a different tool: "track everything I spend on Swiggy
   * and Zomato over 500" → merchants, an amount bound. Structured output
   * only — the caller merges it with the deterministic parser and shows the
   * result back before saving, so nothing here is ever applied unseen.
   */
  async extractWatchRule(sentence: string): Promise<Record<string, unknown> | null> {
    if (!this.lm) return null;
    const result = await this.lm.complete({
      messages: [
        {
          role: 'system',
          content:
            'You turn a personal rule, written in plain language, into a structured filter. ' +
            'Call define_watch once. Copy merchant and sender names exactly as written. ' +
            'Omit any field the sentence does not state.',
        },
        { role: 'user', content: sentence },
      ],
      options: { temperature: 0.0, telemetryEnabled: false, confidenceThreshold: CONFIDENCE_GATE },
      tools: [WATCH_RULE_TOOL],
    });
    const call = result.functionCalls?.[0];
    if (!call || call.name !== WATCH_RULE_TOOL.name) return null;
    return call.arguments ?? null;
  }

  release(): void {
    this.lm = null;
  }

  get isReady(): boolean {
    return this.lm !== null;
  }
}

const WATCH_RULE_TOOL: CactusLMTool = {
  name: 'define_watch',
  description:
    'Called to turn a personal rule such as "track all my food spending on Swiggy over 500" into a filter.',
  parameters: {
    type: 'object',
    properties: {
      merchants: { type: 'string', description: 'Merchant, biller, app or sender names mentioned, comma separated, exactly as written' },
      keywords: { type: 'string', description: 'Other words that identify the messages, comma separated' },
      min_amount: { type: 'number', description: 'Only amounts over this, if the rule says so' },
      max_amount: { type: 'number', description: 'Only amounts under this, if the rule says so' },
      days_before: { type: 'number', description: 'For reminders: how many days before the due date' },
    },
    required: [],
  },
};

function toolNameToCategory(toolName: string): SignalCategory {
  const map: Record<string, SignalCategory> = {
    create_expense: 'finance',
    create_income: 'finance',
    create_bill_reminder: 'bill',
    track_delivery: 'delivery',
    create_travel_booking: 'travel',
    create_task_reminder: 'task',
  };
  return map[toolName] ?? 'noise';
}

// ─── Singleton Export ─────────────────────────────────────────────────────────
export const NeedleEngine = new NeedleEngineClass();
