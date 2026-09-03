import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import {
  accent as themeAccent, palette, shadow, urgency as urgencyPalette, withAlpha,
  COLORS, FONT, TYPE, SPACING, RADIUS,
} from '../../theme/tokens';
import { IconContainer } from './IconContainer';
import { CATEGORY_ICONS, FALLBACK_ICON } from './categoryIcons';
import { useCategoryStore } from '../../store/categoryStore';
import { resolveUrgency } from '../../utils/urgency';
import { cardEnter, standardExit, defaultLayout, PRESS_CONFIG, SPRING } from '../../theme/motion';
import { timeAgo } from '../../utils/helpers';
import type { Insight } from '../../db/repositories/insights';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** How long a resolved card stays undoable before the action commits. */
const UNDO_WINDOW_MS = 3200;

interface InsightCardProps {
  insight: Insight;
  isDark: boolean;
  onTrack: () => void;
  onRemind: () => void;
  onCalendar: () => void;
  onIgnore: () => void;
}

/**
 * Returns the ordered action list for a category.
 * First = primary (filled), second = secondary (pill), rest = text-only (Ignore).
 */
function getContextualActions(category: string) {
  switch (category) {
    case 'finance':
    case 'bill':
      return [
        { key: 'track', label: 'Track' },
        { key: 'remind', label: 'Remind' },
        { key: 'ignore', label: 'Ignore' },
      ];
    case 'travel':
      return [
        { key: 'calendar', label: 'Add to Calendar' },
        { key: 'remind', label: 'Remind' },
        { key: 'ignore', label: 'Ignore' },
      ];
    case 'task':
      return [
        { key: 'remind', label: 'Remind me' },
        { key: 'track', label: 'Track' },
        { key: 'ignore', label: 'Ignore' },
      ];
    case 'delivery':
      return [
        { key: 'track', label: 'Track' },
        { key: 'ignore', label: 'Ignore' },
      ];
    default:
      return [
        { key: 'track', label: 'Track' },
        { key: 'remind', label: 'Remind' },
        { key: 'ignore', label: 'Ignore' },
      ];
  }
}

const RESOLVED_LABEL: Record<string, string> = {
  Track: 'Tracked',
  Remind: 'Reminder set',
  'Remind me': 'Reminder set',
  'Add to Calendar': 'Opened in calendar',
  Ignore: 'Ignored',
  Dismiss: 'Dismissed',
  Revert: 'Reverted',
};

/**
 * Actions that happen the moment they are tapped.
 *
 * Every other action waits out a short undo window before it commits.
 * Opening the calendar cannot: the calendar app *is* the confirmation step,
 * and a dialog that appears three seconds after the tap reads as the phone
 * doing something on its own.
 */
const IMMEDIATE_ACTIONS = new Set(['calendar']);

function InsightCardBase({
  insight,
  isDark,
  onTrack,
  onRemind,
  onCalendar,
  onIgnore,
}: InsightCardProps) {
  const router = useRouter();
  const P = palette(isDark);
  const A = themeAccent(isDark);
  const scale = useSharedValue(1);

  const entities = React.useMemo(() => {
    try { return JSON.parse(insight.entities_json) as Record<string, unknown>; }
    catch { return {}; }
  }, [insight.entities_json]);

  // Selector, not a whole-store read. `useCategoryStore()` bare subscribes to
  // every field, so a `loadCategories()` — which four screens fire on mount —
  // re-rendered every card in the list even though `getAccent` never changes.
  const getAccent = useCategoryStore((s) => s.getAccent);
  const catAccent = getAccent(insight.category, isDark);
  const CategoryIcon = CATEGORY_ICONS[catAccent.icon] ?? FALLBACK_ICON;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Down on a timing, up on a spring. The press has to register on the frame
  // your finger lands — a spring accelerating from rest cannot do that — but
  // the release should look like the card coming back under its own weight
  // rather than being snapped into place. Asymmetry is what gives a press a
  // feeling of substance; two matched timings feel like a value being toggled.
  const handlePressIn = useCallback(() => {
    scale.set(withTiming(PRESS_CONFIG.pressed, { duration: PRESS_CONFIG.duration }));
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.set(withSpring(PRESS_CONFIG.normal, SPRING));
  }, [scale]);

  // ── Resolution, with a real undo window ──────────────────────────────────
  // `undoable` is state rather than "is the timer still set", because the
  // timer lives in a ref and a ref is not something render may read.
  const [resolution, setResolution] = useState<{ label: string; undoable: boolean } | null>(null);
  const resolved = resolution?.label ?? null;
  const canUndo = resolution?.undoable ?? false;
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the timer is waiting to do, so an unmount can finish it rather than
  // lose it. Cleared the moment the commit runs or the user undoes it.
  const pendingCommit = useRef<(() => void) | null>(null);

  /**
   * The timer must never outlive the card — but the *decision* must.
   *
   * Clearing the timer on unmount and stopping there meant an action taken in
   * the last three seconds before the card went away was silently dropped: the
   * user saw "Tracked", the row was never written, and the card was back on the
   * next load. The undo window exists so a mis-tap can be taken back, not so
   * that leaving the screen takes it back for you. So the pending action is run
   * on the way out; it talks to the store, not to this component, and the store
   * outlives the card.
   */
  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    const commit = pendingCommit.current;
    pendingCommit.current = null;
    commit?.();
  }, []);

  const handleAction = (fn: () => void, label: string) => {
    setResolution({ label, undoable: true });
    pendingCommit.current = fn;
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      pendingCommit.current = null;
      fn();
    }, UNDO_WINDOW_MS);
  };

  const handleUndo = () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    pendingCommit.current = null;
    setResolution(null);
  };

  const actions = getContextualActions(insight.category);
  const hasAmount = typeof entities.amount === 'number';
  const isAuto = insight.confidence >= 0.85;


  // Compute a secondary line: summary OR due date — never both with amount
  const secondaryLine = React.useMemo(() => {
    let raw = insight.summary || null;
    if (!raw) return null;

    // Schedule/travel: strip location after '—' to keep just date-time
    if (insight.category === 'travel' && raw.includes('—')) {
      raw = raw.split('—')[0].trim();
    }

    // If card has an amount, check if summary duplicates it
    if (hasAmount) {
      const summaryLower = raw.toLowerCase();
      const amountStr = String(entities.amount);
      if (summaryLower.includes(amountStr) || summaryLower.includes('₹')) {
        const stripped = raw.replace(/₹[\d,]+/g, '').replace(/\d+/g, '').trim();
        return stripped.length > 2 ? stripped : null;
      }
    }
    return raw;
  }, [insight.summary, insight.category, hasAmount, entities.amount]);

  const urgency = React.useMemo(() => resolveUrgency(insight), [insight]);
  const U = urgencyPalette(isDark);
  const tone = U[urgency.level];

  // The resolver already phrases this; re-wording it here is how the rail and
  // the sentence under it drift apart.
  const displayLine = urgency.level === 'none' ? secondaryLine : urgency.label;

  // Urgency owns the rail — it is the one thing that must outrank the space.
  // With no deadline there is nothing to escalate, so the space takes it back.
  const railColor = urgency.level === 'none' ? catAccent.color : tone.color;
  const urgencyTextColor = urgency.level === 'none' ? P.inkMuted : tone.color;

  /**
   * Seriousness is said twice: in colour, and in weight.
   *
   * Colour alone asks the reader to know the ramp — that amber is worse than
   * green and red worse than amber — before the card means anything. Weight does
   * not need to be learned: heavier is more urgent, at a glance, in peripheral
   * vision, and to anyone who cannot separate the hues at all. "Due today" and
   * "Overdue" therefore carry semibold; "in 5 days" and a plain summary do not,
   * and the difference is visible down a scrolling list before a single word has
   * been read.
   */
  const isPressing = urgency.level === 'overdue' || urgency.level === 'today';

  const handleActionPress = (action: { key: string; label: string }) => {
    const fnMap: Record<string, () => void> = {
      track: onTrack,
      remind: onRemind,
      calendar: onCalendar,
      ignore: onIgnore,
      revert: onIgnore,
      dismiss: onIgnore,
    };
    const fn = fnMap[action.key] ?? onIgnore;
    if (IMMEDIATE_ACTIONS.has(action.key)) {
      // No undo for something the calendar app has already been handed.
      setResolution({ label: action.label, undoable: false });
      fn();
      return;
    }
    handleAction(fn, action.label);
  };

  const primaryAction = actions[0];
  const secondaryAction = actions.length > 2 ? actions[1] : null;
  const textActions = secondaryAction ? actions.slice(2) : actions.slice(1);

  const amountText = hasAmount
    ? `${String(entities.currency ?? '₹')}${(entities.amount as number).toLocaleString('en-IN')}`
    : null;

  return (
    <Animated.View
      entering={cardEnter()}
      exiting={standardExit()}
      layout={defaultLayout}
    >
      <AnimatedPressable
        onPress={() => router.push(`/insight/${insight.id}` as never)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? P.surfaceElevated : P.surface,
            borderColor: P.stroke,
          },
          shadow(isDark).card,
          animatedStyle,
        ]}
      >
        {/* ── Urgency rail ─────────────────────────────────────
            The one thing on the card you can read without reading. It stays,
            and everything that competed with it has gone.

            The full-card colour film that used to sit behind all of this is
            gone with them. On its own it was 4.5% and nearly invisible; down a
            scrolling list of six it was the difference between quiet and busy.
            The space is still said twice — by this rail when nothing is due, and
            by the icon tint always — which is twice more than it needs. */}
        <LinearGradient
          colors={[railColor, withAlpha(railColor, 0.15)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.rail}
        />

        <View style={styles.body}>
          <IconContainer tint={catAccent.color} size={30} isDark={isDark}>
            <CategoryIcon size={15} color={catAccent.color} strokeWidth={2} />
          </IconContainer>

          <View style={styles.content}>
            {/* The title carries the full width now. It used to share its row
                with a timestamp and sit under an uppercase category label that
                repeated what the icon beside it already said — two labels for
                one fact, and the thing you actually needed to read squeezed
                between them. */}
            <Text style={[styles.title, { color: P.ink }]} numberOfLines={2}>
              {insight.title}
            </Text>

            {/* The answer, on one line. ₹2,310 and "Due today" are how much and
                by when; they were two stacked rows and they are one thought. */}
            {(!!amountText || !!displayLine) && (
              <View style={styles.valueRow}>
                {!!amountText && (
                  <Text style={[styles.amount, { color: P.ink }]} numberOfLines={1}>
                    {amountText}
                  </Text>
                )}
                {!!displayLine && (
                  <Text
                    style={[
                      styles.support,
                      isPressing && styles.supportUrgent,
                      { color: urgencyTextColor },
                    ]}
                    numberOfLines={1}
                  >
                    {displayLine}
                  </Text>
                )}
              </View>
            )}

            {/* Provenance, age, and - when there is one - the fact that this
                was already dealt with. All on one quiet line.

                "Handled" used to be a filled green pill on a row of its own,
                and on a screen of six auto-handled cards that meant six green
                bars: the loudest element on every card, repeated down the whole
                list, saying the least. What the card is for is "BESCOM, 2,310,
                due today". What was shouting was the app telling you it had
                done its job. Once that is reassuring; six times it is
                decoration, and it cost a whole row each time to say it. */}
            <Text style={[styles.meta, { color: P.inkDim }]} numberOfLines={1}>
              Noticed in {String(entities.entity ?? 'a notification')} ·{' '}
              {timeAgo(insight.created_at)}
            </Text>
          </View>
        </View>

        {/* ── Resolution ─────────────────────────────────────────
            Not separately animated. This row used to slide up 80ms after its
            own card had already faded in, so every card visibly assembled
            itself in two pieces — body first, buttons after. The buttons are
            part of the card; they arrive with it. */}
        <View>
          {resolved ? (
            <View style={[styles.resolvedRow, { backgroundColor: A.actionSoft }]}>
              <Check size={13} color={A.action} strokeWidth={2.5} />
              <Text style={[styles.resolvedText, { color: A.action }]}>
                {RESOLVED_LABEL[resolved] ?? 'Done'}
              </Text>
              {canUndo && (
                <TouchableOpacity onPress={handleUndo} hitSlop={12} activeOpacity={0.6}>
                  <Text style={[styles.undo, { color: A.action }]}>Undo</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : isAuto ? (
            /* Handled, and the way back.
               This briefly shared the provenance line, which was a line too
               far: "Handled - Noticed in Google Calendar - 9h ago" plus a
               Revert control does not fit the width, so the source name - the
               one part you might actually need - was the thing that got cut.
               It sits where every other card's actions sit instead. Still no
               filled bar, still no green slab down the list; just two pieces of
               text on the row that was already there for controls. */
            <View style={styles.actionRow}>
              <View style={styles.handledMark}>
                <Check size={13} color={A.action} strokeWidth={2.75} />
                <Text style={[styles.handledText, { color: A.action }]}>Handled</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleActionPress({ key: 'revert', label: 'Revert' })}
                activeOpacity={0.6}
                style={styles.textAction}
              >
                <Text style={[styles.textActionLabel, { color: P.inkMuted }]}>Revert</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: A.brand }]}
                  onPress={() => handleActionPress(primaryAction)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>{primaryAction.label}</Text>
                </TouchableOpacity>

                {secondaryAction && (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { backgroundColor: A.brandSoft }]}
                    onPress={() => handleActionPress(secondaryAction)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.secondaryBtnText, { color: A.brand }]}>
                      {secondaryAction.label}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {textActions.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  onPress={() => handleActionPress(action)}
                  activeOpacity={0.6}
                  style={styles.textAction}
                >
                  <Text style={[styles.textActionLabel, { color: P.inkMuted }]}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

/** Memoised: a long list of these re-renders on every store tick otherwise. */
export const InsightCard = React.memo(InsightCardBase);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.base,
    // 8, not 12. Cards this much shorter need less air between them or the
    // list reads as gaps with content in it rather than the other way round.
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    // 1dp, not `hairlineWidth`.
    //
    // On a 3x screen `hairlineWidth` is 0.333dp - one physical pixel - and one
    // physical pixel of #E2E8F0 between a white card and a near-white canvas is
    // not an edge, it is a rumour. In light mode the surface is #FFFFFF on
    // #F8F9FC, a 3% step, so the border is doing essentially all the work of
    // saying where the card stops; at sub-pixel weight it could not do it and
    // the cards read as vague pale rectangles.
    //
    // A hairline is right for a rule dividing two regions of the same surface.
    // It is wrong for the outline of an object. This is an object.
    borderWidth: 1,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    // Left keeps the full 16 so the content clears the rail; right can be
    // tighter because nothing is anchored to it any more.
    paddingLeft: SPACING.base,
    paddingRight: SPACING.md,
    overflow: 'hidden',
  },
  // 3px rather than 4. It is the same signal and it no longer has to shout
  // over a coloured film behind it.
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },

  // ── Body: one icon, one column ────────────────────────────────────
  // Everything that reads left-to-right now lives in a single column beside
  // the icon, so the eye travels straight down one edge instead of stepping
  // around a header row, a full-width number, and a bordered footer.
  body: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  content: {
    flex: 1,
    gap: 3,
  },

  title: { ...TYPE.cardTitle },

  // Amount and deadline share a baseline. They are one answer — how much, by
  // when — and stacking them made the card a third taller for no extra meaning.
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
  },
  amount: {
    fontFamily: FONT.semibold,
    // 20, down from 26. At 26 the number outweighed the title, which is the
    // wrong way round: the number is only worth anything once you know what it
    // is for. Semibold rather than bold for the same reason.
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
    // Tabular figures, so amounts line up on the decimal down a scrolling list
    // instead of shimmering row to row.
    fontVariant: ['tabular-nums'],
  },
  // Shrinks rather than pushes: a long deadline truncates instead of shoving
  // the amount off the card.
  support: {
    ...TYPE.cardSupport,
    flexShrink: 1,
  },
  /** Overdue and due-today only. See `isPressing`. */
  supportUrgent: {
    fontFamily: FONT.semibold,
  },

  // Where it came from and how old it is.
  //
  // `caption` (12) rather than `metadata` (11). 11px is the size for a label
  // riding alongside something else - a chip's count, a tick's caption - not
  // for a line of prose that is the only thing on its row. At 11 it read as
  // fine print on a card that has no fine print to give.
  meta: { ...TYPE.caption },

  // Sits in the action row, so it lines up with the buttons other cards show
  // in the same place.
  handledMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
  },
  handledText: {
    ...TYPE.caption,
    fontFamily: FONT.semibold,
  },

  // ── Actions ─────────────────────────────────────────────────
  // Every action a card had, it still has. Compacted, not culled: a row of
  // controls is the card doing its job, and the way to make a busy card calm is
  // to remove the things that were only describing it.
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  primaryBtn: {
    paddingHorizontal: SPACING.base,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: COLORS.white },
  secondaryBtn: {
    paddingHorizontal: SPACING.md,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18 },
  textAction: { paddingHorizontal: SPACING.sm, height: 32, justifyContent: 'center' },
  textActionLabel: { fontFamily: FONT.medium, fontSize: 13, lineHeight: 18 },

  resolvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    height: 36,
    borderRadius: RADIUS.md,
  },
  resolvedText: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, flex: 1 },
  undo: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 18 },
});
