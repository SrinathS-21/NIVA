import {
  Wallet,
  Receipt,
  Package,
  CalendarDays,
  ListChecks,
  Tag,
  Plane,
  Car,
  Home,
  Heart,
  Dumbbell,
  GraduationCap,
  Briefcase,
  ShoppingCart,
  Utensils,
  Coffee,
  Gift,
  Music,
  Film,
  Gamepad2,
  PawPrint,
  Plug,
  Wifi,
  Phone,
  Shield,
  PiggyBank,
  CreditCard,
  TrendingUp,
  Stethoscope,
  Baby,
  Sprout,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * The glyph a space is drawn with, from one registry.
 *
 * There used to be three of these and they disagreed. `categoryStore` said
 * Schedule was a calendar and Commitments was a checklist, which is what the
 * Spaces tab drew; `InsightCard` kept its own map saying Schedule was a plane
 * and Commitments was a clock, which is what the inbox drew. So the same space
 * had two icons depending on which screen you were looking at, and an interview
 * in your Schedule arrived wearing an aeroplane.
 *
 * A space owns its icon by name, in the store. This is where that name is
 * resolved, and everything that draws a space reads it from here.
 *
 * ── Why this is a map and not a function ────────────────────────────────────
 * Both call sites resolve an icon during render, and the React Compiler's
 * `static-components` rule cannot tell a lookup that *returns* a component from
 * a call that *creates* one — so wrapping this in `iconFor(name)` reads better
 * and trips the rule at every call site. Indexing a frozen const is something
 * it can see through.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // The five built-ins keep the first slots, so the default set a user sees is
  // the one their existing spaces already use.
  Wallet,
  Receipt,
  Package,
  CalendarDays,
  ListChecks,
  Tag,

  // Everything else, for spaces people actually make.
  Plane,
  Car,
  Home,
  Heart,
  Dumbbell,
  GraduationCap,
  Briefcase,
  ShoppingCart,
  Utensils,
  Coffee,
  Gift,
  Music,
  Film,
  Gamepad2,
  PawPrint,
  Plug,
  Wifi,
  Phone,
  Shield,
  PiggyBank,
  CreditCard,
  TrendingUp,
  Stethoscope,
  Baby,
  Sprout,
  Wrench,
};

/**
 * The order they are offered in.
 *
 * Object key order is not something to rely on for anything a person sees, and
 * the picker needs a stable sequence anyway.
 */
export const CATEGORY_ICON_NAMES: string[] = Object.keys(CATEGORY_ICONS);

/**
 * What a space with no icon of its own gets.
 *
 * `Tag` rather than something decorative like `Sparkles`, because it is what
 * such a space actually is: labelled, and nothing more. A fallback should look
 * deliberate, not like a placeholder that escaped.
 */
export const FALLBACK_ICON: LucideIcon = Tag;
