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
        due_date: { type: 'string', description: 'Due date as YYYY-MM-DD or natural language like "25th August"' },
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
        estimated_arrival: { type: 'string', description: 'Estimated arrival date or time' },
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
        departure_time: { type: 'string', description: 'Departure time' },
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
        deadline: { type: 'string', description: 'Date and time of the task' },
        urgency: { type: 'string', description: 'low, medium, or high' },
      },
      required: ['title'],
    },
  },
];

// ─── System Prompt ────────────────────────────────────────────────────────────
const NEEDLE_SYSTEM_PROMPT = `You are a precise event classification agent. 
Analyze the incoming message and call the single most appropriate tool.
Extract all relevant entities accurately. 
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
      { role: 'user', content: rawText }
    ];

    const result = await this.lm.complete({
      messages,
      options: { temperature: 0.0 },
      tools: NEEDLE_TOOLS,
    });

    if (result.functionCalls && result.functionCalls.length > 0) {
      const call = result.functionCalls[0];
      return {
        category: toolNameToCategory(call.name),
        toolName: call.name,
        arguments: call.arguments,
        confidence: result.confidence ?? 0.85,
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

  release(): void {
    this.lm = null;
  }

  get isReady(): boolean {
    return this.lm !== null;
  }
}

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
