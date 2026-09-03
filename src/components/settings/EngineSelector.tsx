import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Check, Download, ChevronDown, ChevronRight } from 'lucide-react-native';
import { useModelStore } from '../../store/modelStore';
import { NIVA_MODELS, formatSize, type NivaModelId } from '../../model/registry';
import { palette, accent, SPACING, RADIUS, FONT } from '../../theme/tokens';

interface Props {
  isDark: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect?: () => void;
}

/**
 * Dropdown-style engine selector.
 *
 * Collapsed: single row showing the active model name + chevron.
 * Expanded:  all model rows listed with download / active indicators.
 */
export function EngineSelector({ isDark, expanded, onToggle, onSelect }: Props) {
  const {
    activeModelId, pendingModelId, status, progress, downloadedIds, selectModel,
    allowMobileData, lastError,
  } = useModelStore();
  const waitingForWifi = status === 'waiting_wifi';
  const P = palette(isDark);
  const A = accent(isDark);
  const brand = A.brand;

  const activeModel = NIVA_MODELS.find(m => m.id === activeModelId) ?? NIVA_MODELS[0];

  const handleSelect = (id: NivaModelId) => {
    if (pendingModelId) return;
    if (id === activeModelId && status === 'ready') {
      onSelect?.();
      return;
    }
    selectModel(id).then(() => onSelect?.()).catch(console.error);
  };

  /* ── Collapsed trigger row ─────────────────────────────────── */
  if (!expanded) {
    return (
      <TouchableOpacity
        style={[styles.group, styles.triggerRow, { backgroundColor: P.surface, borderColor: P.stroke }]}
        activeOpacity={0.7}
        onPress={onToggle}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: P.ink }]}>{activeModel.name}</Text>
            <Text style={[styles.tagline, { color: P.inkMuted }]}>
              {waitingForWifi
                ? `Waiting for Wi-Fi to download · ${formatSize(activeModel.sizeMb)}`
                : status === 'error' && lastError
                  ? 'Could not download — tap to retry'
                  : activeModel.tagline}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {pendingModelId && (
            <ActivityIndicator size="small" color={brand} />
          )}
          <ChevronDown size={16} color={P.inkDim} />
        </View>
      </TouchableOpacity>
    );
  }

  /* ── Expanded list ─────────────────────────────────────────── */
  return (
    <View style={[styles.group, { backgroundColor: P.surface, borderColor: P.stroke }]}>
      {/* Collapse header */}
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={onToggle}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <ChevronRight size={14} color={P.inkDim} style={{ transform: [{ rotate: '90deg' }] }} />
          <Text style={[styles.name, { color: P.ink }]}>Select model</Text>
        </View>
        <ChevronDown size={16} color={P.inkDim} style={{ transform: [{ rotate: '180deg' }] }} />
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: P.stroke }]} />

      {/* The one honest thing to say while the engine is held back: why, and
          the way past it. Buried in a footnote nobody would find it. */}
      {waitingForWifi && (
        <>
          <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => allowMobileData().catch(console.error)}>
            <View style={styles.rowMain}>
              <Text style={[styles.name, { color: P.ink }]}>Waiting for Wi-Fi</Text>
              <Text style={[styles.tagline, { color: P.inkMuted }]}>
                The engine downloads once, on Wi-Fi by default. Tap to download on mobile data instead.
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Download size={16} color={brand} strokeWidth={1.75} />
            </View>
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: P.stroke }]} />
        </>
      )}

      {NIVA_MODELS.map((model, idx) => {
        const isActive = model.id === activeModelId;
        const isPending = model.id === pendingModelId;
        const onDevice = downloadedIds.includes(model.id);
        const isLast = idx === NIVA_MODELS.length - 1;
        const failed = isActive && status === 'error';

        return (
          <React.Fragment key={model.id}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              disabled={!!pendingModelId}
              onPress={() => handleSelect(model.id)}
            >
              <View style={styles.rowMain}>
                <View style={styles.rowHead}>
                  <Text style={[styles.name, { color: P.ink }]}>{model.name}</Text>
                  {isActive && !isPending && (
                    <View style={[styles.badge, { backgroundColor: `${brand}18` }]}>
                      <Text style={[styles.badgeText, { color: brand }]}>
                        {failed ? 'Unavailable' : 'Active'}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.tagline, { color: P.inkMuted }]}>{model.tagline}</Text>

                <Text style={[styles.meta, { color: P.inkDim }]}>
                  {isPending
                    ? status === 'downloading'
                      ? `Downloading · ${Math.round(progress * 100)}%`
                      : 'Getting ready…'
                    : onDevice
                      ? `On device · ${formatSize(model.sizeMb)}`
                      : `${formatSize(model.sizeMb)} download`}
                </Text>

                {isPending && (
                  <View style={[styles.track, { backgroundColor: P.inkFaint }]}>
                    <View
                      style={[
                        styles.fill,
                        {
                          backgroundColor: brand,
                          width: `${Math.max(2, Math.round(progress * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                )}
              </View>

              <View style={styles.rowRight}>
                {isPending ? (
                  <ActivityIndicator size="small" color={brand} />
                ) : isActive && !failed ? (
                  <Check size={18} color={brand} strokeWidth={2.25} />
                ) : onDevice ? null : (
                  <Download size={16} color={P.inkDim} strokeWidth={1.75} />
                )}
              </View>
            </TouchableOpacity>

            {!isLast && <View style={[styles.divider, { backgroundColor: P.stroke }]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
    gap: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
    gap: SPACING.md,
  },
  rowMain: { flex: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rowRight: { paddingTop: 2, minWidth: 20, alignItems: 'flex-end' },

  name: { fontFamily: FONT.semibold, fontSize: 14, lineHeight: 19 },
  tagline: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, marginTop: 1 },
  meta: { fontFamily: FONT.medium, fontSize: 11, lineHeight: 15, marginTop: SPACING.xs },

  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  badgeText: { fontFamily: FONT.semibold, fontSize: 10, lineHeight: 14 },

  track: {
    height: 4,
    borderRadius: RADIUS.pill,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: RADIUS.pill },

  divider: { height: StyleSheet.hairlineWidth, marginLeft: SPACING.base },
});
