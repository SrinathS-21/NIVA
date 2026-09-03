import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import { AURORA, BRAND_GRADIENT, FONT, LIGHT, SIGNAL_GRADIENT } from './tokens';

/**
 * The listing video: 24 seconds, portrait, five scenes.
 *
 *   0–4s   The shade — a dozen notifications land, all shouting equally.
 *   4–8s   They fold away; "Your notifications, sorted."
 *   8–14s  The morning briefing card, one line at a time.
 *  14–19s  Notice → Insight → Action, the dot travelling the ribbon.
 *  19–24s  "On your phone. Nothing in the cloud." and the mark.
 *
 * Every scene is a plain React component driven by the frame; Remotion
 * renders it deterministically. Timing uses springs with no overshoot, the
 * same rule the app's motion system follows.
 */

const s = (frame: number, fps: number, delay = 0, durationInFrames = 22) =>
  spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 120 }, durationInFrames });

const NOTIFICATIONS = [
  ['Myntra', 'FLASH SALE! 70% off everything. Hurry!'],
  ['HDFC Bank', 'Credit Card XX4821 statement: ₹8,420 due 24-08'],
  ['Instagram', 'priya_k liked your photo'],
  ['Flipkart', 'Your order is out for delivery today'],
  ['LinkedIn', '12 people viewed your profile'],
  ['ICICI Bank', 'Acct XX8842 debited INR 1,240 · SWIGGY'],
  ['Zomato', 'Craving biryani? 40% off tonight'],
  ['IndiGo', '6E 2043 BLR→DEL 09 Sep 06:15 · PNR K4X9TQ'],
  ['WhatsApp', 'Rahul: send the report by Friday?'],
  ['Airtel', 'Bill of ₹799 due on 02-09'],
  ['Spotify', 'Your Discover Weekly is ready'],
  ['Google Calendar', 'Interview – TCS Round 2, tomorrow 3 PM'],
] as const;

const MATTERS = new Set([1, 3, 5, 7, 8, 9, 11]);

function Card({ app, text, matters, style }: { app: string; text: string; matters?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: LIGHT.surface,
        border: `2px solid ${matters ? LIGHT.brand : LIGHT.stroke}`,
        borderRadius: 28,
        padding: '28px 36px',
        width: 860,
        fontFamily: FONT,
        color: LIGHT.ink,
        boxShadow: '0 12px 40px rgba(15,23,42,0.06)',
        ...style,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 600, color: LIGHT.inkMuted, marginBottom: 6 }}>{app}</div>
      <div style={{ fontSize: 34, fontWeight: 500, lineHeight: 1.25 }}>{text}</div>
    </div>
  );
}

function SceneShade() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: LIGHT.canvas, alignItems: 'center', paddingTop: 120 }}>
      {NOTIFICATIONS.map(([app, text], i) => {
        const t = s(frame, fps, i * 6, 24);
        return (
          <Card
            key={app + i}
            app={app}
            text={text}
            style={{
              position: 'absolute',
              top: 120 + i * 118,
              transform: `translateY(${(1 - t) * -60}px)`,
              opacity: t,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

function SceneSorted() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fold = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const title = s(frame, fps, 34, 26);
  return (
    <AbsoluteFill style={{ background: LIGHT.canvas, alignItems: 'center' }}>
      {NOTIFICATIONS.map(([app, text], i) => {
        const matters = MATTERS.has(i);
        const gone = matters ? 0 : fold;
        return (
          <Card
            key={app + i}
            app={app}
            text={text}
            matters={matters}
            style={{
              position: 'absolute',
              top: 120 + i * 118 * (1 - fold * 0.55) + (matters ? 0 : fold * 40),
              opacity: 1 - gone,
              transform: `scale(${1 - gone * 0.1})`,
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          bottom: 260,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 84,
          letterSpacing: -2,
          color: LIGHT.ink,
          opacity: title,
          transform: `translateY(${(1 - title) * 30}px)`,
        }}
      >
        Your notifications,{' '}
        <span style={{ background: BRAND_GRADIENT, WebkitBackgroundClip: 'text', color: 'transparent' }}>sorted.</span>
      </div>
    </AbsoluteFill>
  );
}

const BRIEFING_LINES: [string, string][] = [
  ['Overdue', 'HDFC credit card ₹8,420'],
  ['Due today', 'Airtel ₹799 · BESCOM ₹2,310'],
  ['Arriving', 'Flipkart order, by 7 PM'],
  ['Yesterday', 'you spent ₹1,240'],
];
const LINE_COLOURS = [LIGHT.overdue, LIGHT.today, LIGHT.signal, LIGHT.inkDim];

function SceneBriefing() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = s(frame, fps, 0, 26);
  return (
    <AbsoluteFill style={{ background: LIGHT.canvas, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: FONT, fontSize: 36, color: LIGHT.inkMuted, fontWeight: 500, marginBottom: 28, opacity: card }}>
        8:00 AM · every morning
      </div>
      <div
        style={{
          width: 900,
          background: LIGHT.surface,
          border: `2px solid ${LIGHT.stroke}`,
          borderRadius: 32,
          padding: 44,
          fontFamily: FONT,
          transform: `translateY(${(1 - card) * 40}px)`,
          opacity: card,
        }}
      >
        <div style={{ fontSize: 30, color: LIGHT.inkMuted, fontWeight: 500 }}>Good morning</div>
        <div style={{ fontSize: 48, fontWeight: 700, color: LIGHT.ink, letterSpacing: -1, marginBottom: 24 }}>
          3 things need you today
        </div>
        {BRIEFING_LINES.map(([head, body], i) => {
          const t = s(frame, fps, 20 + i * 12, 22);
          return (
            <div key={head} style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginTop: 16, opacity: t, transform: `translateX(${(1 - t) * -16}px)` }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: LIGHT_COLOUR(i), marginTop: 14 }} />
              <div style={{ fontSize: 34, color: LIGHT.ink, lineHeight: 1.3 }}>
                <span style={{ fontWeight: 600 }}>{head}: </span>
                {body}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
const LIGHT_COLOUR = (i: number) => LINE_COLOURS[i] ?? LIGHT.inkDim;

const PHASES = [
  { label: 'Notice', colour: LIGHT.signal, caption: 'A message lands' },
  { label: 'Insight', colour: LIGHT.brand, caption: 'Understood on the phone' },
  { label: 'Action', colour: LIGHT.action, caption: 'One tap, or none' },
];

function ScenePhases() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const travel = interpolate(frame, [10, durationInFrames - 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const active = Math.min(2, Math.floor(travel * 3));
  return (
    <AbsoluteFill style={{ background: LIGHT.canvas, alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ position: 'relative', width: 900, height: 200 }}>
        <div style={{ position: 'absolute', top: 96, left: 60, right: 60, height: 6, borderRadius: 3, background: LIGHT.stroke }} />
        <div
          style={{
            position: 'absolute', top: 84, width: 30, height: 30, borderRadius: 15,
            left: `calc(${6 + travel * 88}% - 15px)`, background: BRAND_GRADIENT,
            boxShadow: '0 0 24px rgba(85,39,249,0.45)',
          }}
        />
        {PHASES.map((p, i) => {
          const on = i <= active;
          const pop = s(frame, fps, 10 + i * (durationInFrames - 40) / 3, 18);
          return (
            <div key={p.label} style={{ position: 'absolute', top: 0, left: `${i * 33.3}%`, width: '33.3%', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-block', padding: '16px 34px', borderRadius: 999, fontSize: 34, fontWeight: 600,
                  border: `2px solid ${p.colour}`, color: LIGHT.ink,
                  background: on ? `${p.colour}1A` : LIGHT.surface, opacity: on ? 1 : 0.45,
                  transform: `scale(${0.9 + 0.1 * pop})`,
                }}
              >
                {p.label}
              </div>
              <div style={{ marginTop: 130, fontSize: 28, color: LIGHT.inkMuted, opacity: on ? 1 : 0.35 }}>{p.caption}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function SceneClose() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = s(frame, fps, 0, 28);
  const b = s(frame, fps, 22, 28);
  const c = s(frame, fps, 48, 28);
  return (
    <AbsoluteFill style={{ background: LIGHT.canvas, alignItems: 'center', justifyContent: 'center', fontFamily: FONT, textAlign: 'center' }}>
      <div style={{ width: 200, height: 140, borderRadius: 48, background: BRAND_GRADIENT, opacity: a, transform: `scale(${0.8 + 0.2 * a})`, marginBottom: 40 }} />
      <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3, color: LIGHT.ink, opacity: a }}>
        Niv<span style={{ color: AURORA.violet }}>a</span>
      </div>
      <div style={{ fontSize: 44, fontWeight: 600, color: LIGHT.ink, marginTop: 24, opacity: b }}>On your phone. Nothing in the cloud.</div>
      <div style={{ fontSize: 32, color: LIGHT.inkMuted, marginTop: 12, opacity: b }}>No account · no ads · delete everything in one tap</div>
      <div
        style={{
          marginTop: 64, padding: '22px 44px', borderRadius: 20, fontSize: 34, fontWeight: 600, color: '#FFFFFF',
          background: SIGNAL_GRADIENT, opacity: c, transform: `translateY(${(1 - c) * 20}px)`,
        }}
      >
        Get it on Google Play
      </div>
    </AbsoluteFill>
  );
}

export function NivaPromo() {
  const { fps } = useVideoConfig();
  const sec = (n: number) => Math.round(n * fps);
  return (
    <AbsoluteFill style={{ background: LIGHT.canvas }}>
      <Sequence from={0} durationInFrames={sec(4)}><SceneShade /></Sequence>
      <Sequence from={sec(4)} durationInFrames={sec(4)}><SceneSorted /></Sequence>
      <Sequence from={sec(8)} durationInFrames={sec(6)}><SceneBriefing /></Sequence>
      <Sequence from={sec(14)} durationInFrames={sec(5)}><ScenePhases /></Sequence>
      <Sequence from={sec(19)} durationInFrames={sec(5)}><SceneClose /></Sequence>
    </AbsoluteFill>
  );
}

/**
 * The shareable monthly recap, square, for social. Pass the numbers in as
 * props from the app's export, or edit the defaults.
 */
// A type alias, not an interface: Remotion's `Composition` wants props that
// satisfy `Record<string, unknown>`, which an interface does not.
export type RecapProps = {
  month: string;
  read: number;
  handledByNiva: number;
  spend: string;
  billsPaid: number;
};

export function NivaRecapSquare({ month, read, handledByNiva, spend, billsPaid }: RecapProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows: [string, string][] = [
    ['messages read', String(read)],
    ['handled by Niva', String(handledByNiva)],
    ['spent', spend],
    ['bills paid on time', String(billsPaid)],
  ];
  return (
    <AbsoluteFill style={{ background: LIGHT.canvas, fontFamily: FONT, padding: 90, justifyContent: 'center' }}>
      <div style={{ fontSize: 36, color: LIGHT.inkMuted, fontWeight: 500 }}>{month}, with Niva</div>
      {rows.map(([label, value], i) => {
        const t = s(frame, fps, 8 + i * 10, 22);
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginTop: 28, opacity: t, transform: `translateX(${(1 - t) * -20}px)` }}>
            <div style={{ fontSize: 110, fontWeight: 700, letterSpacing: -4, color: LIGHT.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontSize: 40, color: LIGHT.inkSecondary }}>{label}</div>
          </div>
        );
      })}
      <div style={{ marginTop: 60, fontSize: 34, color: LIGHT.inkMuted }}>
        Everything on my phone, nothing in the cloud. — <span style={{ color: LIGHT.brand, fontWeight: 600 }}>niva</span>
      </div>
    </AbsoluteFill>
  );
}
