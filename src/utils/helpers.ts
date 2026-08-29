/**
 * Utility helpers used throughout the NIVA UI.
 */

// ─── Relative Time ────────────────────────────────────────────────────────────

export function timeAgo(timestampMs: number): string {
  const diffSeconds = Math.floor((Date.now() - timestampMs) / 1000);

  if (diffSeconds < 60) return 'just now';
  if (diffSeconds < 3600) {
    const m = Math.floor(diffSeconds / 60);
    return `${m}m ago`;
  }
  if (diffSeconds < 86400) {
    const h = Math.floor(diffSeconds / 3600);
    return `${h}h ago`;
  }
  const d = Math.floor(diffSeconds / 86400);
  return `${d}d ago`;
}

// ─── Currency Formatting ──────────────────────────────────────────────────────

export function formatCurrency(
  amount: number,
  currency = 'INR',
): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

// ─── ID Generation ────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Category labels and colours live in exactly one place: CATEGORY_ACCENT in
// `src/theme/tokens.ts`, resolved at runtime through
// `useCategoryStore().getAccent()` so user-created categories resolve too.
// They were duplicated here with hardcoded hex; that copy has been removed.
