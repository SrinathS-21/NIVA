import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';
import { AuroraSurface } from '../brand/Aurora';
import { COLORS, FONT, TYPE, RADIUS, SPACING, withAlpha } from '../../theme/tokens';
import { DURATION } from '../../theme/motion';

interface Props {
  onDismiss: () => void;
}

/**
 * The peak.
 *
 * The design brief names one moment as the product's high point: the first
 * time Needle pulls something true out of the noise. Everything before it is
 * setup and permission dialogs; this is the first proof that the setup was
 * worth it. It gets the one gradient surface the inbox is allowed, and it is
 * shown exactly once — a milestone that repeats is a nag.
 */
export function FirstInsightMoment({ onDismiss }: Props) {
  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.slow)}
      exiting={FadeOut.duration(DURATION.fast)}
      style={styles.wrap}
    >
      <AuroraSurface variant="brand" radius={RADIUS.lg} style={styles.card}>
        <View style={styles.iconWrap}>
          <Sparkles size={18} color={COLORS.white} strokeWidth={2.25} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Niva just noticed its first thing for you</Text>
          <Text style={styles.body}>
            From here on, this is where the important stuff lands — without you
            reading every notification to find it.
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          activeOpacity={0.8}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Got it"
        >
          <Text style={styles.buttonText}>Got it</Text>
        </TouchableOpacity>
      </AuroraSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.base,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(COLORS.white, 0.18),
  },
  title: {
    ...TYPE.cardTitle,
    color: COLORS.white,
  },
  body: {
    ...TYPE.caption,
    fontFamily: FONT.medium,
    color: withAlpha(COLORS.white, 0.86),
    marginTop: 2,
  },
  button: {
    paddingHorizontal: SPACING.md,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(COLORS.white, 0.2),
  },
  buttonText: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.white,
  },
});
