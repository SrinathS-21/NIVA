import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../src/store/themeStore';
import { useWatchStore } from '../../src/store/watchStore';
import { useCategoryStore } from '../../src/store/categoryStore';
import { reportInteraction } from '../../src/store/activityStore';
import { palette, accent, COLORS, FONT, RADIUS, SPACING } from '../../src/theme/tokens';
import { MOCK_WATCHES, USE_MOCK_DATA } from '../../src/data/mockData';
import { DURATION } from '../../src/theme/motion';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Plus, Eye, Pause, Play, Trash2, X, Tag } from 'lucide-react-native';
import type { Watch } from '../../src/db/repositories/watches';
import { useTabReset } from '../../src/store/tabResetContext';

type WatchActionType = Watch['action_type'];

/** What a rule does when it fires, in the user's words. */
const WATCH_ACTIONS: { key: WatchActionType; label: string }[] = [
  { key: 'track', label: 'Track it' },
  { key: 'remind', label: 'Remind me' },
  { key: 'calendar', label: 'Add to calendar' },
];

export default function WatchScreen() {
  const isDark = useThemeStore((st) => st.isDark);
  const realWatches = useWatchStore((st) => st.watches);
  const loadWatches = useWatchStore((st) => st.loadWatches);
  const addWatch = useWatchStore((st) => st.addWatch);
  const toggleWatchEnabled = useWatchStore((st) => st.toggleWatchEnabled);
  const removeWatch = useWatchStore((st) => st.removeWatch);
  const categories = useCategoryStore((st) => st.categories);
  const loadCategories = useCategoryStore((st) => st.loadCategories);
  const addCategory = useCategoryStore((st) => st.addCategory);
  const removeCategory = useCategoryStore((st) => st.removeCategory);
  const getAccent = useCategoryStore((st) => st.getAccent);
  const [showCreate, setShowCreate] = useState(false);
  const [showManageCats, setShowManageCats] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedCat, setSelectedCat] = useState('finance');
  /**
   * What the rule *does*. Every watch was hard-coded to 'track' at the call
   * site, so the screen promising to "handle repetitive actions" could only
   * ever express one of them.
   */
  const [selectedAction, setSelectedAction] = useState<WatchActionType>('track');
  const [newCatLabel, setNewCatLabel] = useState('');
  const { consumeReset } = useTabReset();

  // Reset open panels when re-tapping Watch in the dock.
  useEffect(() => {
    if (consumeReset('watch')) {
      setShowCreate(false);
      setShowManageCats(false);
      setNewTitle('');
      setNewCatLabel('');
      setSelectedAction('track');
    }
  }, [consumeReset]);
  const P = palette(isDark);
  const A = accent(isDark);

  useEffect(() => { loadWatches(); }, [loadWatches]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  const watches = useMemo(() => {
    if (realWatches.length > 0) return realWatches;
    return USE_MOCK_DATA ? (MOCK_WATCHES as any[]) : [];
  }, [realWatches]);

  const activeWatches = watches.filter((w: any) => w.enabled === 1);
  const pausedWatches = watches.filter((w: any) => w.enabled === 0);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await addWatch(newTitle.trim(), selectedCat, selectedAction);
    setNewTitle('');
    setSelectedAction('track');
    setShowCreate(false);
  };

  const handleAddCategory = async () => {
    const label = newCatLabel.trim();
    if (!label) return;
    const newCat = await addCategory(label);
    setSelectedCat(newCat.key);
    setNewCatLabel('');
  };

  const handleRemoveCategory = (key: string, label: string) => {
    Alert.alert(
      `Remove "${label}"?`,
      'This category will be removed from Spaces and Watches. Existing items will keep their category.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeCategory(key);
            if (selectedCat === key) setSelectedCat(categories[0]?.key ?? 'finance');
          },
        },
      ],
    );
  };

  const watchHasCategory = (key: string) => watches.some((w: any) => w.category === key);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
      {/* ── Header (shared) ──────────────────────────────────── */}
      <ScreenHeader
        title="Watch"
        subtitle={
          activeWatches.length > 0
            ? `Watching ${activeWatches.length} thing${activeWatches.length > 1 ? 's' : ''} for you`
            : 'Set rules for what to track automatically'
        }
        titleAction={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: P.surface, borderColor: P.stroke }]}
              onPress={() => {
                setShowManageCats(!showManageCats);
              }}
              activeOpacity={0.7}
            >
              <Tag size={14} color={showManageCats ? A.brand : P.inkMuted} strokeWidth={1.75} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: A.brand }]}
              onPress={() => {
                setShowCreate(!showCreate);
              }}
              activeOpacity={0.8}
            >
              <Plus size={16} color={COLORS.white} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} onScroll={reportInteraction} scrollEventThrottle={50}>
        {/* ── Category Manager ──────────────────────────────────── */}
        {showManageCats && (
          <Animated.View entering={FadeInDown.duration(DURATION.normal)} style={styles.sectionWrap}>
            <View style={[styles.managerCard, { backgroundColor: P.surface, borderColor: P.stroke }]}>
              <Text style={[styles.managerTitle, { color: P.ink }]}>Categories</Text>
              <Text style={[styles.managerHint, { color: P.inkMuted }]}>
                Add or remove categories. New ones appear in Spaces and Watches.
              </Text>

              {/* Existing categories */}
              <View style={styles.catList}>
                {categories.map((cat) => {
                  const hasWatches = watchHasCategory(cat.key);
                  const canRemove = !cat.isBuiltIn;
                  return (
                    <View key={cat.key} style={[styles.catRow, { borderBottomColor: P.stroke }]}>
                      <View style={[styles.catDot, { backgroundColor: getAccent(cat.key, isDark).color }]} />
                      <Text style={[styles.catLabel, { color: P.ink }]}>{cat.label}</Text>
                      {cat.isBuiltIn && (
                        <Text style={[styles.catBadge, { color: P.inkDim }]}>Built-in</Text>
                      )}
                      {hasWatches && !cat.isBuiltIn && (
                        <Text style={[styles.catBadge, { color: P.inkDim }]}>{watches.filter((w: any) => w.category === cat.key).length} watch{watches.filter((w: any) => w.category === cat.key).length !== 1 ? 'es' : ''}</Text>
                      )}
                      {canRemove && (
                        <TouchableOpacity
                          onPress={() => handleRemoveCategory(cat.key, cat.label)}
                          style={styles.removeCatBtn}
                          activeOpacity={0.6}
                        >
                          <X size={13} color={A.danger} strokeWidth={2} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Add new category */}
              <View style={styles.addCatRow}>
                <TextInput
                  style={[styles.addCatInput, { backgroundColor: P.canvas, borderColor: P.stroke, color: P.ink }]}
                  placeholder="New category name..."
                  placeholderTextColor={P.inkDim}
                  value={newCatLabel}
                  onChangeText={setNewCatLabel}
                  onSubmitEditing={handleAddCategory}
                />
                <TouchableOpacity
                  style={[styles.addCatBtn, { backgroundColor: newCatLabel.trim() ? A.brand : P.canvasSubtle }]}
                  onPress={handleAddCategory}
                  disabled={!newCatLabel.trim()}
                  activeOpacity={0.7}
                >
                  <Plus size={14} color={newCatLabel.trim() ? COLORS.white : P.inkDim} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Create Sheet ─────────────────────────────────────── */}
        {showCreate && (
          <Animated.View entering={FadeInDown.duration(DURATION.normal)} style={styles.sectionWrap}>
            <View style={[styles.createCard, { backgroundColor: P.surface, borderColor: P.stroke }]}>
              <Text style={[styles.createTitle, { color: P.ink }]}>What should Niva watch for?</Text>
              <Text style={[styles.createHint, { color: P.inkMuted }]}>
                {'e.g. "Track all my food spending"'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: P.canvas, borderColor: P.stroke, color: P.ink }]}
                placeholder="Describe what to watch..."
                placeholderTextColor={P.inkDim}
                value={newTitle}
                onChangeText={setNewTitle}
                multiline
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.base }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {categories.map((cat) => {
                    const isSelected = selectedCat === cat.key;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        onPress={() => setSelectedCat(cat.key)}
                        style={[styles.catPill, {
                          backgroundColor: isSelected ? getAccent(cat.key, isDark).soft : P.canvas,
                          borderColor: isSelected ? getAccent(cat.key, isDark).color : P.stroke,
                        }]}
                      >
                        <Text style={[styles.catPillText, {
                          color: isSelected ? getAccent(cat.key, isDark).color : P.inkMuted,
                          fontFamily: isSelected ? FONT.semibold : FONT.regular,
                        }]}>{cat.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              {/* ── What it does when it fires ──────────────────────────
                  The category says which insights a rule claims; this says
                  what happens to them. Without it every rule created in the
                  app was a `track`, and "remind me 3 days before" was a
                  sentence with nowhere to go. */}
              <Text style={[styles.actionLabel, { color: P.inkDim }]}>Then</Text>
              <View style={styles.actionRow}>
                {WATCH_ACTIONS.map(({ key, label }) => {
                  const isSelected = selectedAction === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setSelectedAction(key)}
                      style={[styles.catPill, {
                        backgroundColor: isSelected ? A.brandSoft : P.canvas,
                        borderColor: isSelected ? A.brand : P.stroke,
                      }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catPillText, {
                        color: isSelected ? A.brand : P.inkMuted,
                        fontFamily: isSelected ? FONT.semibold : FONT.regular,
                      }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.createBtn, { backgroundColor: A.brand, opacity: newTitle.trim() ? 1 : 0.4 }]}
                onPress={handleCreate}
                disabled={!newTitle.trim()}
                activeOpacity={0.8}
              >
                <Text style={styles.createBtnText}>Create Watch</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ── Active Watches ──────────────────────────────────── */}
        {activeWatches.length > 0 && (
          <Animated.View entering={FadeIn.delay(100).duration(DURATION.normal)} style={styles.sectionWrap}>
            <Text style={[styles.sectionLabel, { color: P.inkDim }]}>Active</Text>
            {activeWatches.map((watch: any, idx: number) => {
              const cat = categories.find((c) => c.key === watch.category);
              const accentColor = cat ? getAccent(cat.key, isDark).color : A.brand;
              return (
                <Animated.View key={watch.id} entering={FadeIn.delay(idx * 40).duration(200)}>
                  <View style={[styles.watchCard, { backgroundColor: P.surface, borderColor: P.stroke }]}>
                    <View style={[styles.watchDot, { backgroundColor: accentColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.watchTitle, { color: P.ink }]} numberOfLines={1}>{watch.title}</Text>
                      <Text style={[styles.watchMeta, { color: P.inkMuted }]}>
                        {cat?.label ?? watch.category} ·{' '}
                        {WATCH_ACTIONS.find((a) => a.key === watch.action_type)?.label ?? 'Track it'} ·{' '}
                        {watch.handled_count} handled
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { toggleWatchEnabled(watch.id, false); }}
                      style={styles.iconBtn}
                      accessibilityLabel="Pause watch"
                    >
                      <Pause size={14} color={P.inkMuted} />
                    </TouchableOpacity>
                    {/* Delete was only reachable once a rule had been paused,
                        so removing one took two steps for no reason. */}
                    <TouchableOpacity
                      onPress={() => { removeWatch(watch.id); }}
                      style={styles.iconBtn}
                      accessibilityLabel="Delete watch"
                    >
                      <Trash2 size={14} color={A.danger} />
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              );
            })}
          </Animated.View>
        )}

        {/* ── Paused Watches ──────────────────────────────────── */}
        {pausedWatches.length > 0 && (
          <Animated.View entering={FadeIn.delay(150).duration(DURATION.normal)} style={styles.sectionWrap}>
            <Text style={[styles.sectionLabel, { color: P.inkDim }]}>Paused</Text>
            {pausedWatches.map((watch: any, idx: number) => (
              <Animated.View key={watch.id} entering={FadeIn.delay(idx * 40).duration(200)}>
                <View style={[styles.watchCard, { backgroundColor: P.surface, borderColor: P.stroke, opacity: 0.55 }]}>
                  <View style={[styles.watchDot, { backgroundColor: P.inkDim }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.watchTitle, { color: P.ink }]} numberOfLines={1}>{watch.title}</Text>
                    <Text style={[styles.watchMeta, { color: P.inkMuted }]}>Paused</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { toggleWatchEnabled(watch.id, true); }}
                    style={styles.iconBtn}
                  >
                    <Play size={14} color={A.success} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { removeWatch(watch.id); }}
                    style={styles.iconBtn}
                  >
                    <Trash2 size={14} color={A.danger} />
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {/* ── Empty State ─────────────────────────────────────── */}
        {watches.length === 0 && !showCreate && (
          <Animated.View entering={FadeIn.delay(200).duration(DURATION.slow)} style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: A.brandSoft }]}>
              <Eye size={22} color={A.brand} strokeWidth={2} />
            </View>
            <Text style={[styles.emptyTitle, { color: P.ink }]}>No active watches</Text>
            <Text style={[styles.emptyBody, { color: P.inkMuted }]}>
              Tell Niva what to watch for.{'\n'}It handles repetitive actions automatically.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: A.brand }]}
              onPress={() => setShowCreate(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyBtnText}>Create your first watch</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },

  sectionWrap: { paddingHorizontal: SPACING.base, marginTop: SPACING.base },
  sectionLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 6,
  },

  // ── Category Manager ────────────────────────────────────────────────────
  managerCard: {
    padding: SPACING.base,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  managerTitle: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 2,
  },
  managerHint: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: SPACING.sm,
  },
  catList: {
    marginBottom: SPACING.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catLabel: {
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  catBadge: {
    fontFamily: FONT.regular,
    fontSize: 10,
    lineHeight: 13,
  },
  removeCatBtn: {
    padding: 6,
  },
  addCatRow: {
    flexDirection: 'row',
    gap: 6,
  },
  addCatInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  addCatBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Create Watch ────────────────────────────────────────────────────────
  createCard: {
    padding: SPACING.base,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  createTitle: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 2,
  },
  createHint: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.sm,
    minHeight: 48,
  },
  actionLabel: {
    fontFamily: FONT.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.base,
  },
  catPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  catPillText: { fontSize: 12 },
  createBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    color: COLORS.white,
    fontFamily: FONT.semibold,
    fontSize: 14,
  },

  // ── Watch Cards ─────────────────────────────────────────────────────────
  watchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  watchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  watchTitle: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  watchMeta: {
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
  iconBtn: { padding: SPACING.sm, minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },

  // ── Empty State ─────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 64,
    gap: SPACING.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  emptyTitle: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
  },
  emptyBody: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: COLORS.white,
    fontFamily: FONT.semibold,
    fontSize: 13,
  },
});
