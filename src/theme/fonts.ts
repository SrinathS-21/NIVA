/**
 * The typeface, behind one switch.
 *
 * NIVA is a trusted personal utility, not an AI chatbot, so the face has to
 * read as quiet intelligence — modern and human, never geometric-futurist.
 * Candidates are registered here and swapped by editing `ACTIVE_FONT` alone.
 *
 * Every component reaches a weight through `FONT` (136 call sites at last
 * count), so flipping `ACTIVE_FONT` re-faces the entire app — no other edit.
 *
 * Each candidate MUST supply four SEPARATE STATIC FACES. Do not register a
 * variable font: React Native cannot instance a `wght` axis, so every weight
 * renders at the file's default and the whole hierarchy collapses to one.
 * (`assets/fonts/PlusJakartaSans-*.ttf` is exactly that trap — four identical
 * copies of one variable file. It is unused; do not wire it back up.)
 */
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';

/**
 * A candidate's four faces, keyed by the role each weight plays.
 *
 *   regular  400   body — the one true reading role
 *   medium   500   secondary text and every label under 12px
 *   semibold 600   card titles, amounts, buttons
 *   bold     700   screen titles
 */
export interface Typeface {
  /** Shown in the head-to-head, so the test is self-labelling. */
  label: string;
  /** One line on what this face does to the product's voice. */
  character: string;
  /** `fontFamily` values. Must match the `useFonts` keys. */
  faces: { regular: string; medium: string; semibold: string; bold: string };
  /** The `useFonts` map for this candidate. */
  assets: Record<string, number>;
}

export const CANDIDATES = {
  /**
   * Calm, intelligent, approachable. Humanist enough to stay warm at 24px and
   * open enough in the counters to survive the 10-11px labels on cards and the
   * week strip, which is where this app actually lives.
   */
  plusJakartaSans: {
    label: 'Plus Jakarta Sans',
    character: 'Intelligent · polished · trustworthy',
    faces: {
      regular: 'PlusJakartaSans_400Regular',
      medium: 'PlusJakartaSans_500Medium',
      semibold: 'PlusJakartaSans_600SemiBold',
      bold: 'PlusJakartaSans_700Bold',
    },
    assets: {
      PlusJakartaSans_400Regular,
      PlusJakartaSans_500Medium,
      PlusJakartaSans_600SemiBold,
      PlusJakartaSans_700Bold,
    },
  },

  /**
   * More distinctive than Jakarta — tighter apertures, a slightly technical
   * edge, and unusual letterforms that give a product its own voice. The one
   * to beat if NIVA wants more brand personality than system-correctness.
   */
  manrope: {
    label: 'Manrope',
    character: 'Premium · modern · distinctive',
    faces: {
      regular: 'Manrope_400Regular',
      medium: 'Manrope_500Medium',
      semibold: 'Manrope_600SemiBold',
      bold: 'Manrope_700Bold',
    },
    assets: {
      Manrope_400Regular,
      Manrope_500Medium,
      Manrope_600SemiBold,
      Manrope_700Bold,
    },
  },

  /**
   * The warmest of the three, and the most conventional. Very easy to read,
   * but its friendliness pulls NIVA toward ordinary consumer productivity.
   */
  figtree: {
    label: 'Figtree',
    character: 'Friendly · approachable · human',
    faces: {
      regular: 'Figtree_400Regular',
      medium: 'Figtree_500Medium',
      semibold: 'Figtree_600SemiBold',
      bold: 'Figtree_700Bold',
    },
    assets: {
      Figtree_400Regular,
      Figtree_500Medium,
      Figtree_600SemiBold,
      Figtree_700Bold,
    },
  },
} as const satisfies Record<string, Typeface>;

export type FontCandidate = keyof typeof CANDIDATES;

/** Ordered as the brief ranks them, so the head-to-head reads top to bottom. */
export const CANDIDATE_KEYS = ['plusJakartaSans', 'manrope', 'figtree'] as const;

/** Flip this to re-face the whole app. */
export const ACTIVE_FONT: FontCandidate = 'plusJakartaSans';

/** Weight names, resolved to the active candidate's `fontFamily` strings. */
export const FONT = CANDIDATES[ACTIVE_FONT].faces;

/** Human-readable name of whatever the app itself is set to. */
export const FONT_LABEL: string = CANDIDATES[ACTIVE_FONT].label;

/**
 * Only the active candidate's four faces.
 *
 * This used to load all three candidates — twelve files, roughly 1.2MB — so
 * that the /type-test screen could switch between them live on device. Nothing
 * renders in the app until `useFonts` resolves (see `app/_layout.tsx`), so that
 * was three times the font bytes standing between launch and first paint, for a
 * comparison screen that is no longer routed to. `ACTIVE_FONT` is locked, so
 * the app ships the face it actually uses.
 *
 * The registry above stays: flipping `ACTIVE_FONT` still re-faces the whole app
 * in one line, and this picks up the new candidate's assets with it.
 */
export const FONT_ASSETS: Record<string, number> = CANDIDATES[ACTIVE_FONT].assets;
