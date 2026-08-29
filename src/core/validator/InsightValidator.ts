import { z } from 'zod';
import type { SignalCategory } from '../needle/NeedleEngine';

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
  type: z.string().optional().default('salary'),
});

// ─── 2. Bill Reminder Schema ──────────────────────────────────────────────────

export const BillReminderSchema = z.object({
  bill_type: z.string().default('other'),
  amount_due: z.coerce.number().optional(),
  due_date: z.string().min(1),
  biller_name: z.string().optional(),
});

// ─── 3. Delivery Schema ───────────────────────────────────────────────────────

export const DeliverySchema = z.object({
  provider: z.string().min(1),
  status: z.enum(['ordered', 'shipped', 'out_for_delivery', 'delivered', 'failed', 'returned']).default('shipped'),
  tracking_id: z.string().optional(),
  otp: z.string().optional(),
  estimated_arrival: z.string().optional(),
});

// ─── 4. Travel Booking Schema ─────────────────────────────────────────────────

export const TravelBookingSchema = z.object({
  transport_type: z.enum(['flight', 'train', 'bus', 'cab', 'hotel']).default('flight'),
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
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
});

// ─── Validation & Formatter Engine ────────────────────────────────────────────

export interface ValidatedInsightData {
  category: SignalCategory;
  title: string;
  summary: string;
  entities: Record<string, unknown>;
  confidence: number;
}

export function validateAndFormatInsight(
  toolName: string,
  rawArgs: Record<string, unknown>,
  confidence: number,
): ValidatedInsightData | null {
  try {
    switch (toolName) {
      case 'create_expense': {
        const data = ExpenseSchema.parse(rawArgs);
        return {
          category: 'finance',
          title: `Spent ${data.currency} ${data.amount.toLocaleString('en-IN')} at ${data.merchant}`,
          summary: data.account_tail ? `Account ending in ••${data.account_tail}` : 'Debit Transaction',
          entities: data,
          confidence,
        };
      }

      case 'create_income': {
        const data = IncomeSchema.parse(rawArgs);
        return {
          category: 'finance',
          title: `Received ${data.currency} ${data.amount.toLocaleString('en-IN')} from ${data.source}`,
          summary: `Income / ${data.type.toUpperCase()}`,
          entities: data,
          confidence,
        };
      }

      case 'create_bill_reminder': {
        const data = BillReminderSchema.parse(rawArgs);
        const amountStr = data.amount_due ? ` of INR ${data.amount_due.toLocaleString('en-IN')}` : '';
        const billerStr = data.biller_name ? ` (${data.biller_name})` : '';
        return {
          category: 'bill',
          title: `${capitalize(data.bill_type)} Bill${amountStr} due on ${data.due_date}`,
          summary: `Biller: ${data.biller_name ?? data.bill_type}${billerStr}`,
          entities: data,
          confidence,
        };
      }

      case 'track_delivery': {
        const data = DeliverySchema.parse(rawArgs);
        const statusLabel = data.status.replace(/_/g, ' ').toUpperCase();
        return {
          category: 'delivery',
          title: `${data.provider}: ${statusLabel}`,
          summary: data.otp ? `Delivery OTP: ${data.otp}` : data.tracking_id ? `Tracking: ${data.tracking_id}` : 'Package update',
          entities: data,
          confidence,
        };
      }

      case 'create_travel_booking': {
        const data = TravelBookingSchema.parse(rawArgs);
        const route = data.origin && data.destination ? `${data.origin} → ${data.destination}` : data.transport_type.toUpperCase();
        return {
          category: 'travel',
          title: `${capitalize(data.transport_type)}: ${route}`,
          summary: data.booking_id ? `PNR / Ref: ${data.booking_id}` : `Departure: ${data.departure_time ?? 'Upcoming'}`,
          entities: data,
          confidence,
        };
      }

      case 'create_task_reminder': {
        const data = TaskReminderSchema.parse(rawArgs);
        return {
          category: 'task',
          title: data.title,
          summary: data.deadline ? `Due by ${data.deadline}` : `Urgency: ${data.urgency.toUpperCase()}`,
          entities: data,
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

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
