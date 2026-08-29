import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { accent, palette, COLORS, FONT, RADIUS, SPACING } from '../../theme/tokens';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface CalendarPickerProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
  isDark: boolean;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Returns the day-of-week for the 1st of the month (0=Mon, 6=Sun).
 * Adjusted so Monday = 0.
 */
function firstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Convert Sun=0 → 6, Mon=1 → 0, etc.
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function CalendarPicker({ selectedDate, onSelectDate, onClose, isDark }: CalendarPickerProps) {
  const A = accent(isDark);
  // `palette()` is exactly this ternary, exported from the same module. The
  // inline `require()` it replaces ran a synchronous module lookup on every
  // render of the picker for no gain.
  const P = palette(isDark);

  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());

  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  const totalDays = daysInMonth(viewYear, viewMonth);
  const startOffset = firstDayOfMonth(viewYear, viewMonth);

  // Build grid of day numbers (null for empty cells)
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  // Pad to full rows (always 6 rows × 7 = 42 cells)
  while (cells.length < 42) cells.push(null);

  const navigateMonth = (offset: number) => {
    let m = viewMonth + offset;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  const navigateYear = (offset: number) => {
    setViewYear(viewYear + offset);
  };

  const handleDayPress = (day: number) => {
    const picked = new Date(viewYear, viewMonth, day);
    if (picked > todayNorm) return; // Block future dates
    onSelectDate(picked);
    onClose();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(120)}
      style={[styles.container, { backgroundColor: P.surface, borderColor: P.stroke }]}
    >
      {/* ── Month / Year Header ──────────────────────────────── */}
      <View style={styles.monthHeader}>
        <TouchableOpacity
          onPress={() => navigateYear(-1)}
          style={styles.navBtn}
          activeOpacity={0.6}
        >
          <ChevronLeft size={12} color={P.inkSecondary} strokeWidth={2.5} />
          <ChevronLeft size={12} color={P.inkSecondary} strokeWidth={2.5} style={{ marginLeft: -8 }} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn} activeOpacity={0.6}>
          <ChevronLeft size={14} color={P.inkSecondary} strokeWidth={2.5} />
        </TouchableOpacity>

        <Text style={[styles.monthLabel, { color: P.ink }]}>{monthLabel}</Text>

        <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.navBtn} activeOpacity={0.6}>
          <ChevronRight size={14} color={P.inkSecondary} strokeWidth={2.5} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigateYear(1)}
          style={styles.navBtn}
          activeOpacity={0.6}
        >
          <ChevronRight size={12} color={P.inkSecondary} strokeWidth={2.5} />
          <ChevronRight size={12} color={P.inkSecondary} strokeWidth={2.5} style={{ marginLeft: -8 }} />
        </TouchableOpacity>
      </View>

      {/* ── Day-of-week labels ──────────────────────────────── */}
      <View style={styles.weekdayRow}>
        {DAY_LABELS.map((label) => (
          <Text key={label} style={[styles.weekdayLabel, { color: P.inkDim }]}>{label}</Text>
        ))}
      </View>

      {/* ── Date grid ──────────────────────────────────────── */}
      <View style={styles.grid}>
        {Array.from({ length: 6 }, (_, row) => (
          <View key={row} style={styles.gridRow}>
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (day === null) return <View key={`e-${row}-${col}`} style={styles.dayCell} />;

              const cellDate = new Date(viewYear, viewMonth, day);
              const isSelected = isSameDay(cellDate, selectedDate);
              const isToday = isSameDay(cellDate, todayNorm);
              const isFuture = cellDate > todayNorm;

              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => handleDayPress(day)}
                  disabled={isFuture}
                  style={styles.dayCell}
                  activeOpacity={0.6}
                >
                  <View
                    style={[
                      styles.dayNumber,
                      isSelected && { backgroundColor: A.brand },
                      isToday && !isSelected && { backgroundColor: A.brandSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        {
                          color: isSelected
                            ? COLORS.white
                            : isFuture
                              ? P.inkFaint
                              : isToday
                                ? A.brand
                                : P.ink,
                        },
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Flat, and no shadow properties of any kind. This used to carry its own
  // copy of the indigo-tinted drop, including an `elevation: 8` that Android
  // rendered as a violet halo around the whole picker. It is an opaque panel
  // inside a hairline stroke, sitting in normal flow rather than over anything,
  // so it needs no depth to be read as a panel.
  container: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.xs,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm,
  },

  // ── Month Header ────────────────────────────────────────────────────────
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: SPACING.sm,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  monthLabel: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 18,
    marginHorizontal: SPACING.sm,
    minWidth: 110,
    textAlign: 'center',
  },

  // ── Weekday Row ─────────────────────────────────────────────────────────
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },

  // ── Date Grid ───────────────────────────────────────────────────────────
  grid: {},
  gridRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
  },
  dayNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    lineHeight: 16,
  },
});
