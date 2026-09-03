import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { palette, accent, categoryAccent, FONT, TYPE, RADIUS, SPACING, SCRIM } from '../../theme/tokens';
import { sheetEnter, DURATION } from '../../theme/motion';
import { injectSignal } from '../../core/IngestionService';
import type { PipelineResult } from '../../core/SignalPipeline';
import { SAMPLE_SIGNALS, type SampleSignal } from '../../data/sampleSignals';
import {
  CreditCard, CalendarDays, Truck, MessageSquare, Banknote, ListChecks,
  Zap, Send,
} from 'lucide-react-native';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface SignalInjectorModalProps {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  /** Fired after each run so the caller can refresh whatever it is showing. */
  onInjected?: (result: PipelineResult) => void;
}

/**
 * The presets are the shared samples in data/sampleSignals — the same
 * messages the inbox offers a new install. One fixture, two doors, so the
 * demo and the developer tool can never drift apart.
 */
const ICON_FOR: Record<SampleSignal['category'], typeof CreditCard> = {
  bill: CreditCard,
  finance: Banknote,
  delivery: Truck,
  travel: CalendarDays,
  task: ListChecks,
  noise: Zap,
};

const PRESETS = SAMPLE_SIGNALS.map((s) => ({ ...s, icon: ICON_FOR[s.category] ?? MessageSquare }));

/** What each pipeline outcome should say to someone testing it. */
function describeResult(result: PipelineResult): { text: string; tone: 'good' | 'neutral' | 'bad' } {
  switch (result.status) {
    case 'insight_created':
      return result.watchMatch?.action
        ? { text: `Handled by watch "${result.watchMatch.watch.title}"`, tone: 'good' }
        : { text: `Insight created in ${result.insight?.category}`, tone: 'good' };
    case 'otp_extracted':
      return { text: `OTP extracted: ${result.otpCode}`, tone: 'neutral' };
    case 'filtered_noise':
      return { text: `Filtered as noise (${result.reason})`, tone: 'neutral' };
    case 'duplicate':
      return { text: 'Already captured — deduped', tone: 'neutral' };
    case 'model_not_ready':
      return { text: 'Engine not ready yet — queued for replay', tone: 'bad' };
    // Reachable whenever the engine throws or reports a failed completion. It
    // used to fall through to "Unknown outcome", which is the least useful
    // thing to read on the one screen every bug report is meant to quote.
    case 'classification_failed':
      return { text: 'Engine failed to read it — left pending, retried on next open', tone: 'bad' };
    case 'validation_failed':
      return { text: `Rejected: ${result.reason}`, tone: 'bad' };
    default:
      return { text: 'Unknown outcome', tone: 'bad' };
  }
}

export function SignalInjectorModal({ visible, onClose, isDark, onInjected }: SignalInjectorModalProps) {
  const P = palette(isDark);
  const A = accent(isDark);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ id: string; text: string; tone: 'good' | 'neutral' | 'bad' } | null>(null);
  const [customText, setCustomText] = useState('');

  const run = useCallback(
    async (id: string, input: { rawText: string; source: 'sms' | 'notification'; sender: string }) => {
      setRunningId(id);
      setOutcome(null);
      try {
        const result = await injectSignal(input);
        const described = describeResult(result);
        setOutcome({ id, ...described });
        onInjected?.(result);
      } catch (err) {
        setOutcome({ id, text: `Threw: ${String(err)}`, tone: 'bad' });
      } finally {
        setRunningId(null);
      }
    },
    [onInjected],
  );

  const toneColor = (tone: 'good' | 'neutral' | 'bad') =>
    tone === 'good' ? A.success : tone === 'bad' ? A.danger : A.warning;

  // See the note in SheetModal: an Android modal window that does not draw
  // under the system bars flashes those bands on open and close.
  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(DURATION.fast)} style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={onClose} />

        <Animated.View
          entering={sheetEnter()}
          style={[styles.sheet, { backgroundColor: P.surfaceElevated }]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: P.inkDim }]} />
          </View>

          <Text style={[styles.sheetTitle, { color: P.ink }]}>Signal Injector</Text>
          <Text style={[styles.sheetSub, { color: P.inkMuted }]}>
            Each preset is a raw message. It goes through the same normalizer,
            engine, validator and watch rules a real one does.
          </Text>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {PRESETS.map((preset) => (
              <PresetRow
                key={preset.id}
                label={preset.label}
                text={preset.text}
                sender={preset.sender}
                tint={categoryAccent(preset.category, isDark)}
                Icon={preset.icon}
                isRunning={runningId === preset.id}
                outcome={outcome?.id === preset.id ? outcome : null}
                toneColor={toneColor}
                isDark={isDark}
                onPress={() =>
                  run(preset.id, {
                    rawText: preset.text,
                    source: preset.source,
                    sender: preset.sender,
                  })
                }
              />
            ))}

            {/* ── Free text ─────────────────────────────────────────────
                The presets cover the shapes we already know about. This is
                for the ones we do not: paste the message that Niva got
                wrong and watch exactly where it goes. */}
            <View style={styles.customWrap}>
              <Text style={[styles.customLabel, { color: P.inkDim }]}>Custom message</Text>
              <TextInput
                style={[styles.customInput, {
                  backgroundColor: P.canvas,
                  borderColor: P.stroke,
                  color: P.ink,
                }]}
                placeholder="Paste any SMS or notification text…"
                placeholderTextColor={P.inkDim}
                value={customText}
                onChangeText={setCustomText}
                multiline
              />
              <TouchableOpacity
                style={[styles.customBtn, {
                  backgroundColor: customText.trim() ? A.brand : P.canvasSubtle,
                }]}
                disabled={!customText.trim() || runningId === 'custom'}
                onPress={() =>
                  run('custom', {
                    rawText: customText.trim(),
                    source: 'sms',
                    sender: 'Manual',
                  })
                }
                activeOpacity={0.8}
              >
                {runningId === 'custom' ? (
                  <ActivityIndicator size="small" color={P.inkMuted} />
                ) : (
                  <>
                    <Send size={14} color={customText.trim() ? P.canvas : P.inkDim} strokeWidth={2} />
                    <Text style={[styles.customBtnText, {
                      color: customText.trim() ? P.canvas : P.inkDim,
                    }]}>
                      Run through pipeline
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {outcome?.id === 'custom' && (
                <Text style={[styles.outcomeText, { color: toneColor(outcome.tone) }]}>
                  {outcome.text}
                </Text>
              )}
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={[styles.closeBtnText, { color: P.inkMuted }]}>Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── Animated Preset Row ──────────────────────────────────────────────────────
function PresetRow({
  label,
  text,
  sender,
  tint,
  Icon,
  isRunning,
  outcome,
  toneColor,
  isDark,
  onPress,
}: {
  label: string;
  text: string;
  sender: string;
  tint: { color: string; soft: string };
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  isRunning: boolean;
  outcome: { text: string; tone: 'good' | 'neutral' | 'bad' } | null;
  toneColor: (tone: 'good' | 'neutral' | 'bad') => string;
  isDark: boolean;
  onPress: () => void;
}) {
  const P = palette(isDark);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedTouchable
      style={[styles.presetRow, { borderColor: P.stroke }, animatedStyle]}
      onPress={onPress}
      disabled={isRunning}
      onPressIn={() => { scale.set(withTiming(0.97, { duration: 60 })); }}
      onPressOut={() => { scale.set(withTiming(1.0, { duration: 80 })); }}
      activeOpacity={0.8}
    >
      <View style={[styles.presetIcon, { backgroundColor: tint.soft }]}>
        <Icon size={16} color={tint.color} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.presetTitle, { color: P.ink }]}>{label}</Text>
        <Text style={[styles.presetSub, { color: P.inkMuted }]} numberOfLines={2}>
          {sender} · {text}
        </Text>
        {outcome && (
          <Text style={[styles.outcomeText, { color: toneColor(outcome.tone) }]}>
            {outcome.text}
          </Text>
        )}
      </View>
      {isRunning ? (
        <ActivityIndicator size="small" color={P.inkDim} />
      ) : (
        <Zap size={16} color={P.inkDim} />
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: SCRIM.sheet,
    justifyContent: 'flex-end',
  },
  overlayTouch: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetTitle: {
    ...TYPE.cardTitle,
    paddingHorizontal: SPACING.base,
    marginTop: 8,
  },
  sheetSub: {
    ...TYPE.footnote,
    paddingHorizontal: SPACING.base,
    marginTop: 4,
    marginBottom: SPACING.sm,
  },
  scroll: {
    flexGrow: 0,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  presetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTitle: { ...TYPE.cardTitle },
  presetSub: { ...TYPE.footnote, marginTop: 2 },
  outcomeText: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },

  // ── Custom message ─────────────────────────────────────────────────────────
  customWrap: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.base,
  },
  customLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  customInput: {
    minHeight: 72,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'top',
  },
  customBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  customBtnText: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },

  closeBtn: {
    marginTop: SPACING.base,
    marginHorizontal: SPACING.base,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: RADIUS.md,
  },
  closeBtnText: {
    ...TYPE.cardTitle,
  },
});
