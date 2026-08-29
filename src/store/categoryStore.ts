import { create } from 'zustand';
import { getDb } from '../db/schema';
import { spaceAccent, hueAccent, DEFAULT_SPACE_ACCENT, SPACE_PALETTE } from '../theme/tokens';

// ── Spaces ───────────────────────────────────────────────────────────────────
/**
 * A space is a lens on the inbox. Five ship with the app; a user can add more,
 * rename any of them, and move any of them to a different palette slot.
 */
export interface Category {
  key: string;
  label: string;
  icon: string; // lucide icon name
  isBuiltIn: boolean;
  /**
   * Which slot in `SPACE_PALETTE` this space owns.
   *
   * An index rather than a hex on purpose: the store cannot see the theme, so
   * a colour resolved here would be frozen to whichever mode happened to be on
   * when it was saved. Resolve with `getAccent(key, isDark)` at render.
   */
  accentIndex: number;
  /**
   * A hue off the wheel, 0-359, when the user chose their own colour instead of
   * a preset. Takes precedence over `accentIndex`.
   *
   * A hue rather than a colour for the same reason `accentIndex` is an index:
   * the store cannot see the theme, and a resolved colour would be frozen to
   * whichever mode was on when it was picked. `hueAccent(hue, isDark)` turns it
   * into something legible on the ground it lands on.
   */
  accentHue?: number;
}

const BUILT_INS: Omit<Category, 'accentIndex'>[] = [
  { key: 'finance',  label: 'Money',       icon: 'Wallet',       isBuiltIn: true },
  { key: 'bill',     label: 'Bills',       icon: 'Receipt',      isBuiltIn: true },
  { key: 'delivery', label: 'Deliveries',  icon: 'Package',      isBuiltIn: true },
  { key: 'travel',   label: 'Schedule',    icon: 'CalendarDays', isBuiltIn: true },
  { key: 'task',     label: 'Commitments', icon: 'ListChecks',   isBuiltIn: true },
];

function defaults(): Category[] {
  return BUILT_INS.map((c) => ({ ...c, accentIndex: DEFAULT_SPACE_ACCENT[c.key] ?? 0 }));
}

/**
 * A stable identifier for a space, derived from what the user typed.
 *
 * The identifier has to be unique, and the obvious slug is not: "Task" becomes
 * `task`, which is already the built-in Commitments space. Creating one put two
 * rows with the same key in the list, and React refused to render a list with
 * two children sharing a key - the whole Spaces tab went blank. "Travel",
 * "Finance", "Bill" and "Delivery" all do the same thing.
 *
 * `taken` is every key already in use, built-in and custom, so a collision
 * becomes `task_2` rather than a broken screen. The suffix is on the key only;
 * the label stays exactly what was typed, so a user who wants two spaces both
 * called Task can have them.
 */
function slugify(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') ||
    // Every character was punctuation or script this cannot transliterate.
    // An empty key is still a key, and two of them would collide again.
    'space';

  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

interface Pref {
  key: string;
  label: string | null;
  accent_index: number | null;
  accent_hue: number | null;
  icon: string | null;
}

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  loadCategories: () => Promise<void>;
  /** `accentIndex` is the palette slot the user picked while creating it. */
  addCategory: (
    label: string,
    accentIndex?: number,
    accentHue?: number,
    icon?: string,
  ) => Promise<Category>;
  renameCategory: (key: string, newLabel: string) => Promise<void>;
  /** Move a space to a `SPACE_PALETTE` slot, clearing any custom hue. */
  recolorCategory: (key: string, accentIndex: number) => Promise<void>;
  /** Give a space a colour off the wheel. `hue` is 0-359. */
  recolorCategoryByHue: (key: string, hue: number) => Promise<void>;
  /** Give a space a different glyph. `icon` is a key of `CATEGORY_ICONS`. */
  reiconCategory: (key: string, icon: string) => Promise<void>;
  removeCategory: (key: string) => Promise<void>;
  getAccent: (
    key: string,
    isDark: boolean,
  ) => {
    color: string;
    soft: string;
    film: string;
    name: string;
    label: string;
    /** Lucide icon name. Resolve via `CATEGORY_ICONS` in components/ui/categoryIcons. */
    icon: string;
  };
}

async function readPrefs(): Promise<Map<string, Pref>> {
  const db = await getDb();
  const rows = await db.getAllAsync<Pref>(
    `SELECT key, label, accent_index, accent_hue, icon FROM category_prefs`,
  );
  return new Map(rows.map((r) => [r.key, r]));
}

/**
 * `accentHue: null` is meaningful and different from leaving it out: it is how
 * a space goes back to a preset after having had a custom colour. So the hue
 * column is written unconditionally when the patch mentions it at all, rather
 * than COALESCE'd like the others — COALESCE cannot express "clear this".
 */
async function writePref(
  key: string,
  patch: {
    label?: string;
    accentIndex?: number;
    accentHue?: number | null;
    icon?: string;
  },
) {
  const db = await getDb();
  const touchesHue = 'accentHue' in patch;
  await db.runAsync(
    `INSERT INTO category_prefs (key, label, accent_index, accent_hue, icon, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       label        = COALESCE(excluded.label, category_prefs.label),
       accent_index = COALESCE(excluded.accent_index, category_prefs.accent_index),
       accent_hue   = ${touchesHue ? 'excluded.accent_hue' : 'category_prefs.accent_hue'},
       icon         = COALESCE(excluded.icon, category_prefs.icon),
       updated_at   = excluded.updated_at`,
    [
      key,
      patch.label ?? null,
      patch.accentIndex ?? null,
      patch.accentHue ?? null,
      patch.icon ?? null,
      Date.now(),
    ],
  );
}

/**
 * The read that is already in flight, if there is one.
 *
 * Every tab calls `loadCategories()` from a mount effect, and all five tabs
 * mount together behind the dock. That was five identical two-query round
 * trips, each ending in a `set({ categories })` with a brand-new array — so
 * four redundant re-renders of every subscriber, including every card in the
 * inbox, during the first second of the app's life. They share one read now.
 *
 * Only the read path dedupes. Anything that has just *written* goes through
 * `refresh()` instead, because joining a read that started before the write
 * would hand back rows that predate it — a rename that silently reverts.
 */
let inFlight: Promise<void> | null = null;

/** The actual read. */
async function refresh(set: (partial: Partial<CategoryState>) => void): Promise<void> {
  set({ isLoading: true });
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ key: string; label: string; created_at: number }>(
      `SELECT key, label, created_at FROM custom_categories ORDER BY created_at ASC`,
    );
    const prefs = await readPrefs();

    // Custom spaces start at the slot after the built-ins and wrap, so the
    // first few a user creates are visibly different from each other.
    const firstFree = BUILT_INS.length;
    const custom: Category[] = rows.map((row, idx) => ({
      key: row.key,
      label: row.label,
      icon: 'Tag',
      isBuiltIn: false,
      accentIndex: (firstFree + idx) % SPACE_PALETTE.length,
    }));

    /**
     * Deduped on the way out, not just prevented on the way in.
     *
     * `slugify` stops new collisions, but any database that already has one
     * would keep crashing the Spaces tab on every launch - and the fix cannot
     * be to rename the row, because `key` is what every insight is filed
     * under. First wins, so a built-in beats a custom row that has grown into
     * its key: the built-in is the one the insights actually mean.
     */
    const seen = new Set<string>();
    const all = [...defaults(), ...custom]
      .filter((c) => {
        if (seen.has(c.key)) return false;
        seen.add(c.key);
        return true;
      })
      .map((c) => {
        const pref = prefs.get(c.key);
        return pref
          ? {
              ...c,
              label: pref.label ?? c.label,
              accentIndex: pref.accent_index ?? c.accentIndex,
              accentHue: pref.accent_hue ?? undefined,
              icon: pref.icon ?? c.icon,
            }
          : c;
      });

    set({ categories: all, isLoading: false });
  } catch {
    set({ categories: defaults(), isLoading: false });
  }
}


export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: defaults(),
  isLoading: false,

  loadCategories: async () => {
    if (inFlight) return inFlight;
    inFlight = refresh(set).finally(() => {
      inFlight = null;
    });
    return inFlight;
  },

  addCategory: async (
    label: string,
    accentIndex?: number,
    accentHue?: number,
    icon?: string,
  ) => {
    const key = slugify(label, new Set(get().categories.map((c) => c.key)));
    const db = await getDb();

    await db.runAsync(
      `CREATE TABLE IF NOT EXISTS custom_categories (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO custom_categories (key, label, created_at) VALUES (?, ?, ?)`,
      [key, label, Date.now()],
    );

    // Written before the read, not after, so the space appears in its chosen
    // colour on the first render it ever has. Setting it afterwards would show
    // the positional default for a frame and then correct itself — a space
    // flickering out of one colour into another the instant you create it.
    const n = SPACE_PALETTE.length;
    await writePref(key, {
      ...(accentHue !== undefined
        ? { accentHue: ((Math.round(accentHue) % 360) + 360) % 360 }
        : accentIndex !== undefined
          ? { accentIndex: ((Math.trunc(accentIndex) % n) + n) % n }
          : {}),
      ...(icon ? { icon } : {}),
    });

    await refresh(set);

    const cats = get().categories;
    return (
      cats.find((c) => c.key === key) ?? {
        key,
        label,
        icon: 'Tag',
        isBuiltIn: false,
        accentIndex: 0,
      }
    );
  },

  /**
   * Renames any space, built-in included.
   *
   * Built-ins used to refuse this. The label is presentation, not identity —
   * insights key off `category`, which never changes — so there was no reason
   * a user could not call Bills "Utilities".
   */
  renameCategory: async (key: string, newLabel: string) => {
    const label = newLabel.trim();
    if (!label) return;

    const cat = get().categories.find((c) => c.key === key);
    if (!cat) return;

    if (cat.isBuiltIn) {
      await writePref(key, { label });
    } else {
      const db = await getDb();
      await db.runAsync(`UPDATE custom_categories SET label = ? WHERE key = ?`, [label, key]);
    }
    await refresh(set);
  },

  recolorCategory: async (key: string, accentIndex: number) => {
    const n = SPACE_PALETTE.length;
    await writePref(key, {
      accentIndex: ((Math.trunc(accentIndex) % n) + n) % n,
      // Explicitly null, not omitted. Picking a preset has to *undo* a custom
      // hue, and the hue outranks the slot — leave it in place and the preset
      // would appear to do nothing at all.
      accentHue: null,
    });
    await refresh(set);
  },

  recolorCategoryByHue: async (key: string, hue: number) => {
    await writePref(key, { accentHue: ((Math.round(hue) % 360) + 360) % 360 });
    await refresh(set);
  },

  // Built-ins included. A glyph is presentation, exactly like the label and the
  // colour, and every insight keys off `category` - which never changes - so
  // there is nothing to protect by refusing.
  reiconCategory: async (key: string, icon: string) => {
    await writePref(key, { icon });
    await refresh(set);
  },

  removeCategory: async (key: string) => {
    const cat = get().categories.find((c) => c.key === key);
    if (cat?.isBuiltIn) return;

    const db = await getDb();
    await db.runAsync(`DELETE FROM custom_categories WHERE key = ?`, [key]);
    await db.runAsync(`DELETE FROM category_prefs WHERE key = ?`, [key]);
    await refresh(set);
  },

  /**
   * A space's colour, resolved for the theme on screen right now.
   *
   * Takes `isDark` because the store deliberately holds no hexes — see
   * `Category.accentIndex`.
   */
  getAccent: (key: string, isDark: boolean) => {
    const cat = get().categories.find((c) => c.key === key);
    const index = cat?.accentIndex ?? DEFAULT_SPACE_ACCENT[key] ?? 0;
    // A hue the user picked outranks a palette slot — that is the whole point
    // of having chosen one.
    const base =
      cat?.accentHue !== undefined
        ? hueAccent(cat.accentHue, isDark)
        : spaceAccent(index, isDark);
    return {
      ...base,
      label: cat?.label ?? key,
      // Carried alongside the colour so a card and its space cannot disagree
      // about what the space looks like — they used to, from separate maps.
      icon: cat?.icon ?? 'Tag',
    };
  },
}));
