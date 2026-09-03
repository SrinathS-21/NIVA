/* eslint-disable import/first -- jest.mock must precede the imports it replaces */
/**
 * The tap that launched the app.
 *
 * `addNotificationResponseReceivedListener` replays nothing, and on a cold
 * start the response is recorded natively before the root layout has finished
 * waiting on fonts and the database. These pin the two halves of the fix: the
 * launch tap is delivered once, and it is cleared so the *next* ordinary launch
 * does not navigate to a notification tapped days ago.
 */
let mockLastResponse: unknown = null;
const mockListeners: ((response: unknown) => void)[] = [];

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationResponseReceivedListener: jest.fn((fn: (r: unknown) => void) => {
    mockListeners.push(fn);
    return { remove: () => mockListeners.splice(mockListeners.indexOf(fn), 1) };
  }),
  getLastNotificationResponse: jest.fn(() => mockLastResponse),
  clearLastNotificationResponse: jest.fn(() => {
    mockLastResponse = null;
  }),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-sqlite', () => ({}));

import { onNotificationOpened } from '../core/notify/Notifier';

const responseFor = (data: Record<string, unknown>) => ({
  notification: { request: { content: { data } } },
});

beforeEach(() => {
  mockLastResponse = null;
  mockListeners.length = 0;
});

describe('onNotificationOpened', () => {
  test('a reminder tapped on a cold start routes to its insight', () => {
    mockLastResponse = responseFor({ url: '/insight/abc', insightId: 'abc' });

    const seen: string[] = [];
    onNotificationOpened((url) => seen.push(url));

    expect(seen).toEqual(['/insight/abc']);
  });

  test('the launch tap is consumed, so the next launch does not replay it', () => {
    mockLastResponse = responseFor({ url: '/insight/abc' });

    onNotificationOpened(() => {})();

    const seen: string[] = [];
    onNotificationOpened((url) => seen.push(url));
    expect(seen).toEqual([]);
  });

  test('an ordinary launch routes nowhere', () => {
    const seen: string[] = [];
    onNotificationOpened((url) => seen.push(url));
    expect(seen).toEqual([]);
  });

  test('a tap while the app is running still arrives', () => {
    const seen: string[] = [];
    onNotificationOpened((url) => seen.push(url));

    mockListeners.forEach((fn) => fn(responseFor({ url: '/insight/live' })));
    expect(seen).toEqual(['/insight/live']);
  });

  test('a notification with no route falls back to the inbox', () => {
    mockLastResponse = responseFor({});
    const seen: string[] = [];
    onNotificationOpened((url) => seen.push(url));
    expect(seen).toEqual(['/']);
  });
});
