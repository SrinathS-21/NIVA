import { insightShareText } from '../core/share/ShareBridge';
import { insightsToCsv } from '../core/export/Exporter';
import type { Insight } from '../db/repositories/insights';

jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '/tmp' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: async () => {} }));
jest.mock('expo-sqlite', () => ({}));

function insight(category: string, title: string, entities: Record<string, unknown>, summary = ''): Insight {
  return {
    id: 'i', signal_id: null, category, title, summary, entities_json: JSON.stringify(entities),
    confidence: 0.9, status: 'inbox', created_at: new Date(2026, 8, 2).getTime(), actioned_at: null,
  };
}

describe('insightShareText', () => {
  test('a bill reads as a human note', () => {
    const t = insightShareText(insight('bill', 'HDFC Bank credit card bill', { amount: 8420, currency: '₹', dueDate: '2099-01-05' }, 'Payment due'));
    expect(t.split('\n')[0]).toBe('HDFC Bank credit card bill');
    expect(t).toContain('₹8,420 · Due');
    expect(t).not.toContain('Payment due'); // redundant with the Due line
    expect(t.endsWith('— from Niva')).toBe(true);
  });
  test('a booking carries its reference and time', () => {
    const t = insightShareText(insight('travel', 'Flight BLR → DEL', { date: '2099-01-05', time: { hour: 6, minute: 15 }, booking_id: 'K4X9TQ' }));
    expect(t).toContain('On ');
    expect(t).toContain('6:15 AM');
    expect(t).toContain('Ref K4X9TQ');
  });
});

describe('insightsToCsv', () => {
  test('header plus one quoted row', () => {
    const csv = insightsToCsv([insight('finance', 'Paid Swiggy, twice', { entity: 'Swiggy', amount: 1240, currency: '₹', direction: 'out' }, 'From account ••8842')]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('date,space,title,from,amount,currency,direction,due,status,summary');
    expect(row).toBe('2026-09-02,finance,"Paid Swiggy, twice",Swiggy,1240,₹,out,,inbox,From account ••8842');
  });
});
