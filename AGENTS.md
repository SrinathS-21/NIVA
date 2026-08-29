This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.
## Expo has changed — do not trust your training data
Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:
1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v57.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.
## Commands
Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).
```bash
npx expo install <package> # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start # start the dev server
npx expo lint # lint
npx tsc --noEmit # typecheck
npx expo-doctor # diagnose dependency and config issues
npx expo install --fix # fix incompatible package versions
```
Run lint and typecheck before declaring any task done.
## Navigation & Routing
- Use **Expo Router** for all navigation. Routes live in `app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md
## Building with EAS
Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/
## Rules
- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/

## Mobile App UI/UX Design Skill
Source: ceorkm/mobile-app-ui-design (adapted for NIVA)

### Core Philosophy
Great mobile UI is about intentionality. Every pixel, spacing value, and color choice should serve the user.
Before designing anything, understand:
1. What is the user trying to accomplish? (reduce friction)
2. How should this make the user feel? (trust, delight, confidence, calm)
3. What's the one thing they should notice first? (visual hierarchy)

> **Source of truth:** `src/theme/tokens.ts`. Never write a raw hex, font family,
> or spacing number in `src/` or `app/` — import the token. Where this document
> and `tokens.ts` ever disagree, `tokens.ts` wins and this file is the bug.

### Design Laws
- **90/10 Color Rule**: 90% quiet neutral canvas, 10% Aurora signal
- **8-Point Grid System**: All spacing divisible by 8 or 4 (8, 12, 16, 24, 32, 48, 64, 80, 96)
- **Peak-End Rule**: Users remember peak moment + ending — design those intentionally
- **Thumb Zone**: Primary actions in bottom 1/3 of screen
- **F-Pattern**: Natural reading/scanning order for content
- **Typography Hierarchy**: Max 4 sizes, 2 weights. Monospace for large numbers.

### Visual Design Rules
#### Color (90/10)
- 90% neutral base (canvas, surfaces, text), 10% Aurora (mark, one primary CTA, signal cues)
- Use opacity variations of neutral for text hierarchy: 100% headings, 80% body, 60-70% secondary
- Accent at 5% opacity for secondary buttons and subtle card highlights
- Depth is carried by **1dp borders**, not shadows. `hairlineWidth` is a third of
  a pixel at 3x and does not read as an outline; it is for rules, not objects.
- iOS gets a soft ink shadow. **Android gets no `elevation`, ever** — it renders
  as a hard grey box under any animated opacity, and both the tab dissolve and
  the dock's hide-on-scroll are exactly that. Also: Android ignores
  `shadowOpacity` entirely, so a tinted shadow there arrives at full strength
  as a coloured halo.
- Save strong colors (red) for meaningful moments — overuse kills hierarchy

#### Typography
- One font family (two max, with clear hierarchy purpose)
- Max 4 font sizes and 2 font weights
- Monospace for large numbers (prices, stats)
- Hierarchy via size, weight, opacity — not just bold everything

#### Spacing (8-Point Grid)
- All spacing values divisible by 8 or 4
- Related elements closer, unrelated further (2× multiplier rule)
- Card internal padding: 24-32px baseline
- Larger text = larger spacing needed

#### Shadows
- Always soft shadows — never harsh
- Match shadow color to background with tinted hue
- Subtle white inner shadows on buttons for dimension

### Emotional Design (Peak-End Rule)
- Identify the peak moment (completing core task, milestone)
- Design the peak: micro-animations, celebratory feedback, sparkles
- Design the ending: summary card, progress affirmation, gentle nudge to return
- Emotional feedback loops: success feels rewarding, mistakes gently corrected
- Celebrate small wins intentionally

### Smart Patterns
- **Personalization by stage**: New → simple welcome; Returning → personalized; Power → dense stats
- **Empty states**: Never generic — guide with illustration + CTA
- **Status tracking**: Open with confident status, visual timelines > date lists
- **Selection over input**: Tappable selections for common options, icons/emojis for personality
- **Never show blank search**: Include recent, popular, personalized

### Anti-Patterns to Avoid
- Decorative gradients or blur beyond the one Aurora surface a screen is allowed
- Raw hex, raw `fontFamily`, or raw spacing numbers outside `src/theme/`
- More than 4 font sizes or 3 weights
- Random spacing values (use 8-point grid)
- Hiding key content behind banners or extra taps
- CTAs outside thumb zone
- Generic empty states with no guidance
- All information same visual weight (no hierarchy)
- Emphasizing labels over values ("Sales" bigger than "591")
- Pure gray/black shadows on colored backgrounds

### NIVA-Specific Design Decisions
- **Domain**: AI/Finance hybrid — trust + intelligence
- **The mark is the system**: the logo is one ribbon sweeping cyan → violet, and that sweep maps onto the product lifecycle. The mapping is `phase(isDark)` in `tokens.ts` — real tokens, so use them rather than re-deriving the hexes here. Violet is the ribbon's resolving end: identity and peak moments only, never status.
- **`AURORA` is not the lifecycle.** It is the four gradient stops of the artwork. `phase()` is the four product states. They deliberately do not share names or hexes; conflating them is what once put two different indigos in the shipped app.
- **Color**: light-first. Canvas `#F8F9FC` / obsidian `#0A0C10` is the 90%; Aurora is the 10%.
  `AURORA` and `brand` are **sampled from `assets/logo-mark.png`**, not chosen beside it — the ribbon is six stops (cyan 179 → magenta 295) and `brand` is its indigo, `#5527F9`. No single ribbon stop clears AA on both grounds, so the sweep is only ever a gradient; UI accents are stepped derivatives at the same hue.
- **Custom space colours** are stored as a **hue**, never a hex, and resolved per theme by `hueAccent(hue, isDark)` — which guarantees 4.5:1 on whichever ground it lands on. That is what makes a free picker safe.
- **Every colour comes from an accessor, and `COLORS.*` is not one.** Nothing outside `src/theme/` holds a hex or an `rgba()` — that is currently true and worth keeping true, since a literal is how a value ends up correct in one theme and broken in the other.

  | need | use |
  |:--|:--|
  | canvas, surface, ink, stroke | `palette(isDark)` |
  | brand, signal, semantic, category hues | `accent(isDark)` |
  | Notice / Insight / Value / Action status | `phase(isDark)` |
  | a category by key, built-in or custom | `useCategoryStore().getAccent(key, isDark)` |
  | elevation | `shadow(isDark)` — neutral ink, never a coloured glow. `.card` is barely there; `.floating` is for the dock, which sits *over* content. None in dark. |
  | modal scrim | `SCRIM.sheet` / `SCRIM.subtle` |

  `COLORS.*` and `AURORA.*` are the raw light-mode and gradient-stop hues. They are inputs to the accessors, not values for a component: half are near-white pastels that glow on obsidian, and half are full-saturation brights that measure under 3:1 on light canvas.
- **Two contrast tiers, deliberately.** `accent()`'s text tier (brand, signal, action, success, danger, warning) clears 4.5:1 on its own canvas and against white. The five category hues clear only 3:1 — darkening them enough for body text collapses five distinguishable hues into three muddy ones. So category colour is for icon tints, dots and hairlines; a category **label** renders in ink with the colour beside it, never under it.
- A static `StyleSheet.create` block cannot see the theme. Keep geometry there and pass the colour in the JSX style array.
- **Gradients**: the Aurora sweep is the signature and is *required* on identity and the primary CTA — one gradient surface per screen, no more. Decorative gradients elsewhere remain an anti-pattern.
- **Typography**: Plus Jakarta Sans, via `TYPE` roles or `FONT` weights — never a raw `fontFamily` string. The face is chosen in one place, `src/theme/fonts.ts`: candidates are registered there and `ACTIVE_FONT` picks one, so re-facing the app is a one-line edit. The four weights are four *static* faces: React Native cannot instance a variable font's `wght` axis, so shipping one variable file under four names silently renders the whole app at 400. Weights follow the type brief — screen titles 700, card titles / amounts / buttons 600, secondary text and sub-12px labels 500, body 400.
- **Industry lessons**: Revolut (tactile interactions build trust), Phantom (polish = trust), Spotify (hide complex tech in familiar interfaces)
- **Peak moment**: When Needle first surfaces a real insight from noise — the "aha"
- **End moment**: After acting on an insight — confirmation + progress reinforcement
