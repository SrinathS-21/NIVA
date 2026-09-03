# Niva listing video (Remotion)

Two compositions, rendered with [Remotion](https://www.remotion.dev):

| Id | Size | Length | Use |
|:--|:--|:--|:--|
| `NivaPromo` | 1080×1920 | 24 s | Play Store listing video (upload to YouTube, link in the listing) |
| `NivaRecapSquare` | 1080×1080 | 6 s | Monthly recap for Instagram / X; numbers are props |

## Why this is a separate project

Remotion renders React to video in Node + Chromium. It is the right tool for
the store video and social clips, and the wrong tool for anything inside the
app — React Native has no DOM, and a phone should never render video frames
to show a chart. The app's own visuals are plain views (see
`src/components/charts`). Keeping this out of the app's `package.json` keeps
Remotion's dependency tree and Chromium download off every app build.

## Run

```bash
cd marketing/listing-video
npm install
npm run studio          # live preview at http://localhost:3000
npm run render          # → out/niva-promo.mp4
npm run render:square   # → out/niva-recap.mp4
```

Render a recap with real numbers:

```bash
npx remotion render src/index.ts NivaRecapSquare out/recap.mp4 \
  --props='{"month":"September 2026","read":84,"handledByNiva":23,"spend":"₹24,580","billsPaid":4}'
```

The first render downloads a headless Chromium (~150 MB) once.

## Brand

Colours are copied from the app's `src/theme/tokens.ts` into `src/tokens.ts`.
If the ribbon or canvas changes there, change it here. The typeface falls back
to system sans if Plus Jakarta Sans is not installed on the rendering machine;
install it for exact match.
