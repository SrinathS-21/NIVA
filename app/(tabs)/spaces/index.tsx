import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, FlatList, ScrollView, StyleSheet, Alert, Modal,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../src/store/themeStore';
import { useInboxStore } from '../../../src/store/inboxStore';
import { useCategoryStore } from '../../../src/store/categoryStore';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import {
  palette, accent, spaceAccent, hueAccent, withAlpha, SPACE_PALETTE,
  COLORS, FONT, RADIUS, SPACING, SCRIM,
} from '../../../src/theme/tokens';
import { MOCK_INSIGHTS, USE_MOCK_DATA } from '../../../src/data/mockData';
import { spacePrimary, spaceStatus } from '../../../src/utils/spaceMetrics';
import { useSpaceMetrics } from '../../../src/store/useSpaceMetrics';
import { cardEnter } from '../../../src/theme/motion';
import { useRouter } from 'expo-router';
import { Plus, X, Trash2, ChevronDown } from 'lucide-react-native';
import { CATEGORY_ICONS, FALLBACK_ICON } from '../../../src/components/ui/categoryIcons';
import { HuePicker, HueSwatch } from '../../../src/components/ui/HuePicker';
import { IconPicker } from '../../../src/components/ui/IconPicker';
import type { Insight } from '../../../src/db/repositories/insights';
import { reportInteraction } from '../../../src/store/activityStore';
import { useTabReset } from '../../../src/store/tabResetContext';

const BUILT_IN_KEYS = ['finance', 'bill', 'delivery', 'travel', 'task'];

function SpaceManagerModal({
  visible, onClose, isDark, mode, spaceKey, spaceLabel, spaceAccentIndex,
  spaceAccentHue, spaceIcon, onCreated, onRenamed, onDeleted,
}: {
  visible: boolean; onClose: () => void; isDark: boolean;
  mode: 'create' | 'rename'; spaceKey?: string; spaceLabel?: string;
  spaceAccentIndex?: number; spaceAccentHue?: number; spaceIcon?: string;
  onCreated: (label: string) => void;
  onRenamed: (key: string, newLabel: string) => void;
  onDeleted: (key: string) => void;
}) {
  // Seeded once, not synced in an effect. The call site keys this component on
  // the space being edited, so opening a different one remounts it with fresh
  // initial state — an effect would run after paint and flash the last space's
  // name into the field first.
  const [inputValue, setInputValue] = useState(
    mode === 'rename' && spaceLabel ? spaceLabel : '',
  );
  const [pickedAccent, setPickedAccent] = useState(spaceAccentIndex ?? 0);
  /**
   * The custom hue, or null while a preset is selected. Two pieces of state
   * rather than one, because "which preset" and "which hue" are different
   * questions — collapsing them would mean a preset had to be reverse-looked-up
   * from a hue, and the eight presets are not evenly spaced around the wheel.
   */
  const [pickedHue, setPickedHue] = useState<number | null>(spaceAccentHue ?? null);
  const [pickedIcon, setPickedIcon] = useState(spaceIcon ?? 'Tag');
  const [showIcons, setShowIcons] = useState(false);
  // Open on a space that already has a custom colour, so editing one starts
  // where you left it rather than making you find the disc again.
  const [showWheel, setShowWheel] = useState(spaceAccentHue !== undefined);
  /**
   * True while a finger is on the colour wheel.
   *
   * The dialog scrolls, and on Android a native ScrollView intercepts touches
   * beneath the React responder system - so the wheel could claim the gesture
   * and still have it taken away the moment the drag went vertical, which going
   * round a circle does for half its travel. Switching the scroll off for the
   * duration is the only thing that reliably stops that.
   */
  const [wheelDragging, setWheelDragging] = useState(false);
  const isBuiltIn = BUILT_IN_KEYS.includes(spaceKey ?? '');
  const addCategory = useCategoryStore((st) => st.addCategory);
  const renameCategory = useCategoryStore((st) => st.renameCategory);
  const removeCategory = useCategoryStore((st) => st.removeCategory);
  const recolorCategory = useCategoryStore((st) => st.recolorCategory);
  const recolorCategoryByHue = useCategoryStore((st) => st.recolorCategoryByHue);
  const reiconCategory = useCategoryStore((st) => st.reiconCategory);
  const P = palette(isDark);
  const A = accent(isDark);

  // What the icon grid previews with: whichever colour is currently chosen, so
  // the two controls show you the actual pairing rather than two guesses.
  const previewTint =
    pickedHue !== null
      ? hueAccent(pickedHue, isDark).color
      : spaceAccent(pickedAccent, isDark).color;

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;
    if (mode === 'create') {
      await addCategory(
        inputValue.trim(),
        pickedAccent,
        pickedHue ?? undefined,
        pickedIcon,
      );
      onCreated(inputValue.trim());
    } else if (spaceKey) {
      await renameCategory(spaceKey, inputValue.trim());
      // Whichever control was touched last wins. Picking a preset clears the
      // hue; moving the wheel overrides the preset.
      if (pickedHue !== null && pickedHue !== spaceAccentHue) {
        await recolorCategoryByHue(spaceKey, pickedHue);
      } else if (pickedHue === null && pickedAccent !== spaceAccentIndex) {
        await recolorCategory(spaceKey, pickedAccent);
      }
      if (pickedIcon !== spaceIcon) await reiconCategory(spaceKey, pickedIcon);
      onRenamed(spaceKey, inputValue.trim());
    }
    setInputValue('');
    onClose();
  };

  const handleDelete = () => {
    if (!spaceKey) return;
    Alert.alert('Delete "' + (spaceLabel ?? '') + '"?',
      'This space will be removed. Items will keep their category.',
      [
        { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive',
              onPress: async () => {
                await removeCategory(spaceKey);
                onDeleted(spaceKey);
                onClose();
              },
          },
      ],
    );
  };

  if (!visible) return null;

  // `statusBarTranslucent` is not optional on Android: the app draws edge to
  // edge, a modal opens its own Window, and a window that does not also draw
  // under the status bar repaints that band on open and on close — which is
  // seen as a strip flashing at the top of the screen.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A `Pressable` backdrop behind, and a plain `View` for the card.
          These were two nested `TouchableOpacity`s - the outer one to dismiss,
          the inner one to swallow taps so the outer would not - and a
          `ScrollView` inside them could never scroll. A touchable claims the
          responder for the whole gesture, so a drag that starts on the card
          belongs to the touchable and never reaches the list underneath. That
          is the sticking: the scroll was not slow, it was never receiving the
          gesture at all. */}
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalOverlay} pointerEvents="box-none">
        <View style={[styles.modalCard, { backgroundColor: P.surface, borderColor: P.stroke }]}>
        <ScrollView
          contentContainerStyle={styles.modalScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!wheelDragging}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: P.ink }]}>
              {mode === 'create' ? 'New Space' : 'Rename Space'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <X size={16} color={P.inkMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.modalInput, { backgroundColor: P.canvas, borderColor: P.stroke, color: P.ink }]}
            placeholder={mode === 'create' ? 'e.g. Subscriptions, Pets...' : 'Space name'}
            placeholderTextColor={P.inkDim}
            value={inputValue}
            onChangeText={setInputValue}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {/* ── Icon ───────────────────────────────────────────────────
              A button showing the current glyph, and the grid only when asked.
              Thirty-two tiles laid out permanently made the dialog taller than
              the phone for a choice most people will not change - a space
              called "Pets" wants a paw print once and never again. */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: P.inkMuted }]}>Icon</Text>
            <TouchableOpacity
              onPress={() => setShowIcons((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: showIcons }}
              accessibilityLabel="Choose icon"
              style={[
                styles.discloseBtn,
                {
                  backgroundColor: withAlpha(previewTint, isDark ? 0.18 : 0.1),
                  borderColor: showIcons ? previewTint : P.stroke,
                },
              ]}
            >
              {React.createElement(
                CATEGORY_ICONS[pickedIcon] ?? FALLBACK_ICON,
                { size: 17, color: previewTint, strokeWidth: 2.1 },
              )}
              {/* The word is the affordance. A glyph next to a chevron says
                  something opens but not what, and the chevron alone is the
                  smallest target and the weakest signal on the row - it read as
                  decoration on the icon rather than a control. "Change" says
                  what happens; "Done" says how to get out, which a disclosure
                  that pushes a 32-tile grid into the dialog badly needs. */}
              <Text style={[styles.discloseText, { color: P.inkSecondary }]}>
                {showIcons ? 'Done' : 'Change'}
              </Text>
              <ChevronDown
                size={13}
                color={P.inkDim}
                strokeWidth={2.25}
                style={{ transform: [{ rotate: showIcons ? '180deg' : '0deg' }] }}
              />
            </TouchableOpacity>
          </View>

          {/* Inset on its own ground, so the grid reads as a panel that opened
              rather than thirty-two loose tiles that appeared in the dialog. */}
          {showIcons && (
            <View
              style={[
                styles.disclosePanel,
                { backgroundColor: P.canvasSubtle, borderColor: P.stroke },
              ]}
            >
              <IconPicker
                value={pickedIcon}
                onChange={(name) => {
                  setPickedIcon(name);
                  setShowIcons(false);
                }}
                tint={previewTint}
                isDark={isDark}
              />
            </View>
          )}

          {/* ── Colour ─────────────────────────────────────────────────
              Eight presets and, at the end of the row, one disc that is every
              colour. That ninth swatch is the only thing in the row that is not
              a single colour, which is what makes it readable as "anything
              else" without a label - and the wheel it opens stays folded away
              until it is wanted.

              Offered when creating as well as when editing. Naming a space and
              choosing how it looks are one decision, and splitting them meant a
              new space arrived in whatever slot the list happened to hand it. */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: P.inkMuted }]}>Colour</Text>
            <Text style={[styles.fieldValue, { color: P.inkSecondary }]}>
              {pickedHue !== null
                ? `Custom \u00b7 ${pickedHue}\u00b0`
                : SPACE_PALETTE[pickedAccent]?.name ?? ''}
            </Text>
          </View>

          <View style={styles.swatchRow}>
            {SPACE_PALETTE.map((hue, i) => {
              const on = pickedHue === null && i === pickedAccent;
              return (
                <TouchableOpacity
                  key={hue.name}
                  onPress={() => {
                    setPickedAccent(i);
                    setPickedHue(null);
                    setShowWheel(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={hue.name}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: spaceAccent(i, isDark).color,
                      // The ring is the selection, not a size change, so the
                      // row never reflows as you tap along it.
                      borderColor: on ? P.ink : COLORS.transparent,
                    },
                  ]}
                />
              );
            })}

            <HueSwatch
              active={pickedHue !== null}
              isDark={isDark}
              onPress={() => {
                // Opening it is choosing it. Landing on the wheel with nothing
                // selected would leave the row showing no selection at all
                // until the first drag, which reads as having lost the setting.
                if (pickedHue === null) setPickedHue(210);
                setShowWheel((v) => !v);
              }}
            />
          </View>

          {showWheel && (
            <HuePicker
              hue={pickedHue}
              onChange={setPickedHue}
              onDragChange={setWheelDragging}
              isDark={isDark}
            />
          )}

          <View style={styles.modalActions}>
            {mode === 'rename' && !isBuiltIn && (
              <TouchableOpacity style={styles.modalDeleteBtn} onPress={handleDelete} activeOpacity={0.7}>
                <Trash2 size={14} color={A.danger} strokeWidth={2} />
                <Text style={[styles.modalDeleteText, { color: A.danger }]}>Delete</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onClose} style={[styles.modalCancelBtn, { borderColor: P.stroke }]} activeOpacity={0.7}>
              <Text style={[styles.modalCancelText, { color: P.inkMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} style={[styles.modalSubmitBtn, { backgroundColor: A.brand, opacity: inputValue.trim() ? 1 : 0.4 }]} activeOpacity={0.8} disabled={!inputValue.trim()}>
              <Text style={styles.modalSubmitText}>{mode === 'create' ? 'Create' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export default function SpacesScreen() {
  const [showManager, setShowManager] = useState(false);
  const [managerMode, setManagerMode] = useState<"create" | "rename">("create");
  const [editingSpace, setEditingSpace] = useState<
    {
      key: string;
      label: string;
      accentIndex: number;
      accentHue?: number;
      icon: string;
    } | null
  >(null);
  const isDark = useThemeStore((st) => st.isDark);
  const { consumeReset } = useTabReset();
  const router = useRouter();

  // Nothing to reset any more. The grid has no filter and no selection - the
  // thing this used to clear was the active pill, and there is no active pill.
  useEffect(() => {
    if (consumeReset('spaces')) setShowManager(false);
  }, [consumeReset]);

  const categories = useCategoryStore((st) => st.categories);
  const loadCategories = useCategoryStore((st) => st.loadCategories);
  const getAccent = useCategoryStore((st) => st.getAccent);
  const realInsights = useInboxStore((st) => st.insights);
  // Figures come from the database, across every status — a space's "12 paid"
  // cannot be counted from a store that only holds what is still pending.
  const metricsFor = useSpaceMetrics();
  const P = palette(isDark);
  const A = accent(isDark);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const allInsights = useMemo(() => {
    if (realInsights.length > 0) return realInsights;
    return USE_MOCK_DATA ? (MOCK_INSIGHTS as unknown as Insight[]) : [];
  }, [realInsights]);

  /**
   * How many things are waiting in each space, in one pass.
   *
   * The rail this replaces only ever needed the count for the space you were
   * looking at. A grid needs all of them at once, which is the whole point of
   * it - and doing that as a `filter` per card would walk the list once per
   * space on every render.
   */
  const pendingByKey = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of allInsights) {
      if (i.status !== 'inbox') continue;
      counts[i.category] = (counts[i.category] ?? 0) + 1;
    }
    return counts;
  }, [allInsights]);

  const pendingTotal = useMemo(
    () => Object.values(pendingByKey).reduce((a, b) => a + b, 0),
    [pendingByKey],
  );

  const handleOpenCreate = () => {
    setManagerMode("create"); setEditingSpace(null); setShowManager(true);
  };

  const handleOpenRename = (
    key: string,
    label: string,
    accentIndex: number,
    icon: string,
    accentHue?: number,
  ) => {
    // Built-ins included. A space's label, colour and glyph are presentation;
    // every insight keys off `category`, which never changes, so there is
    // nothing to protect by refusing.
    setManagerMode("rename");
    setEditingSpace({ key, label, accentIndex, accentHue, icon });
    setShowManager(true);
  };

  const handleSpaceCreated = () => {};
  const handleSpaceRenamed = () => {};
  const handleSpaceDeleted = () => {};

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: P.canvas }]} edges={[]}>
      <ScreenHeader
        title="Spaces"
        subtitle={
          pendingTotal > 0
            ? `${categories.length} spaces \u00b7 ${pendingTotal} need attention`
            : `${categories.length} spaces \u00b7 all clear`
        }
        titleAction={
          <TouchableOpacity onPress={handleOpenCreate}
            style={[styles.titleAddBtn, { backgroundColor: A.brandSoft }]} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="New space">
            <Plus size={16} color={A.brand} strokeWidth={2.5} />
          </TouchableOpacity>
        } />

      {/* Every space, at once.
          This was a horizontal rail of pills that filtered a list underneath -
          which meant the page could only ever answer "how is *this* space
          doing?", one space at a time, and answering "how are my areas doing?"
          took five taps and a memory for the numbers in between. A grid answers
          the question the page is actually named after.

          It also stops being a filter pretending to be navigation. A card is a
          place you go; tapping one opens the space rather than rearranging the
          screen you are already on. */}
      <FlatList
        data={categories}
        keyExtractor={(c) => c.key}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        onScroll={reportInteraction}
        scrollEventThrottle={50}
        renderItem={({ item }) => (
          <SpaceCard
            label={item.label}
            iconName={item.icon}
            tint={getAccent(item.key, isDark)}
            primary={spacePrimary(item.key, pendingByKey[item.key] ?? 0, metricsFor(item.key))}
            status={spaceStatus(pendingByKey[item.key] ?? 0)}
            pending={pendingByKey[item.key] ?? 0}
            isDark={isDark}
            onPress={() => router.push(`/spaces/${item.key}` as never)}
            onLongPress={() =>
              handleOpenRename(
                item.key,
                item.label,
                item.accentIndex,
                item.icon,
                item.accentHue,
              )
            }
          />
        )}
      />

      <SpaceManagerModal
        key={`${managerMode}:${editingSpace?.key ?? 'new'}`}
        visible={showManager} onClose={() => setShowManager(false)}
        isDark={isDark} mode={managerMode} spaceKey={editingSpace?.key}
        spaceLabel={editingSpace?.label}
        // Editing opens on the space's own colour; creating opens on the next
        // slot along, so the suggestion is already distinct from what is there.
        spaceAccentIndex={
          editingSpace?.accentIndex ?? categories.length % SPACE_PALETTE.length
        }
        spaceAccentHue={editingSpace?.accentHue}
        // A new space starts on `Tag`, which is what the store gives one
        // anyway - so the grid opens showing the truth rather than a suggestion
        // that has not been saved.
        spaceIcon={editingSpace?.icon ?? 'Tag'}
        onCreated={handleSpaceCreated}
        onRenamed={handleSpaceRenamed} onDeleted={handleSpaceDeleted} />
    </SafeAreaView>
  );
}

/**
 * One space, as a place you can go.
 *
 * The number leads and the name sits above it, which is the opposite of the
 * usual arrangement and deliberate: down a grid you are scanning values, and a
 * column of labels with the figures buried underneath makes you read every card
 * to compare any two.
 *
 * The status line is the only thing tinted. A card whose space wants nothing
 * says so in ink and stops competing; a card with something waiting says it in
 * the space's own colour, which is what turns the grid into something you can
 * triage at a glance rather than a directory.
 */
function SpaceCard({
  label, iconName, tint, primary, status, pending, isDark, onPress, onLongPress,
}: {
  label: string;
  iconName: string;
  tint: { color: string; soft: string };
  primary: string;
  status: string;
  pending: number;
  isDark: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const P = palette(isDark);
  const Icon = CATEGORY_ICONS[iconName] ?? FALLBACK_ICON;

  return (
    <Animated.View entering={cardEnter()} style={styles.cardWrap}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${status}`}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? P.surfaceElevated : P.surface,
            borderColor: P.stroke,
          },
        ]}
      >
        <View style={[styles.cardIcon, { backgroundColor: tint.soft }]}>
          <Icon size={16} color={tint.color} strokeWidth={2} />
        </View>

        <Text style={[styles.cardLabel, { color: P.inkMuted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.cardPrimary, { color: P.ink }]} numberOfLines={1}>
          {primary}
        </Text>
        <Text
          style={[
            styles.cardStatus,
            { color: pending > 0 ? tint.color : P.inkDim },
          ]}
          numberOfLines={1}
        >
          {status}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // -- Grid ----------------------------------------------------------------
  grid: { padding: SPACING.base, paddingBottom: 96, gap: SPACING.md },
  gridRow: { gap: SPACING.md },
  // The wrapper carries the width so the entering animation has something
  // stable to animate, and the card fills it.
  cardWrap: { flex: 1 },
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.md,
    gap: 2,
    minHeight: 132,
  },
  cardIcon: {
    width: 30, height: 30, borderRadius: RADIUS.sm,
    alignItems: "center", justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  cardLabel: {
    fontFamily: FONT.medium, fontSize: 12, lineHeight: 16,
  },
  cardPrimary: {
    fontFamily: FONT.bold, fontSize: 20, lineHeight: 26,
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
  },
  cardStatus: {
    fontFamily: FONT.medium, fontSize: 11, lineHeight: 15,
  },
  // `flexShrink: 0` is the load-bearing half of this, and it was missing.
  //
  // React Native gives every ScrollView a base style of `flexGrow: 1,
  // flexShrink: 1`. Setting `flexGrow: 0` stopped the rail claiming space the
  // list below wanted, but left it shrinkable - so in a column whose children
  // together want more height than there is, the rail was the thing that gave.
  // It lost about a third of its height and clipped its own pills through the
  // middle of their labels, which is not a shape anyone would design and so
  // read as the row being half-drawn.
  //
  // Neither growing nor shrinking: the rail is exactly as tall as one row of
  // pills, always.
  // No `flexGrow`, no `minWidth`. Those stretched pills to fill a row and made
  // five spaces look like a broken table; on a rail each is as wide as its name.
  titleAddBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  modalBackdrop: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: SCRIM.sheet,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center", alignItems: "center", paddingHorizontal: SPACING.xl,
  },
  modalCard: {
    width: "100%", borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "82%",
  },
  modalScroll: {
    padding: SPACING.base,
    gap: SPACING.md,
  },
  // Label on the left, current value or control on the right - so each setting
  // reads as one line whether or not its picker is open.
  fieldRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", minHeight: 34,
  },
  fieldLabel: {
    fontFamily: FONT.medium, fontSize: 11, lineHeight: 15,
    letterSpacing: 0.1,
  },
  fieldValue: {
    fontFamily: FONT.semibold, fontSize: 12, lineHeight: 16,
  },
  discloseBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: SPACING.md, height: 34,
    borderRadius: RADIUS.md, borderWidth: 1,
  },
  discloseText: {
    fontFamily: FONT.semibold, fontSize: 12, lineHeight: 16,
  },
  disclosePanel: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontFamily: FONT.bold, fontSize: 16, lineHeight: 22 },
  modalClose: { padding: 6 },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    fontFamily: FONT.regular, fontSize: 14, lineHeight: 20,
  },
  swatchRow: {
    flexDirection: "row", alignItems: "center",
    // Nine swatches now, so they wrap on a narrow phone rather than being
    // squeezed until the ring around the selected one clips.
    flexWrap: "wrap", gap: SPACING.sm,
  },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2.5 },
  modalActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalDeleteBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  modalDeleteText: {
    fontFamily: FONT.semibold, fontSize: 13,
  },
  modalCancelBtn: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
  },
  modalCancelText: { fontFamily: FONT.semibold, fontSize: 13 },
  modalSubmitBtn: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: RADIUS.md,
  },
  modalSubmitText: {
    fontFamily: FONT.semibold, fontSize: 13, color: COLORS.white,
  },
});