# Brand assets

## Masters

| File | Size | Notes |
|:--|:--|:--|
| `NIVA_logo.png` | 1536×1024 | The ribbon mark with its glow, on transparency. Source of truth. |
| `NIVA_Logo_Text.png` | 2172×724 | The `NIVA` wordmark, near-black ink with a violet dot in the `A`, on transparency. |

Everything below is **generated from these two** — don't hand-edit the outputs.
Replace a master and regenerate instead.

## Generated

| File | Size | Derived how |
|:--|:--|:--|
| `icon.png` | 1024×1024 | Ribbon at 62% on obsidian `#0A0C10`. Padding leaves room for iOS's mask. |
| `android-icon-foreground.png` | 1024×1024 | Ribbon at 52%, transparent. Sits inside the centre safe zone so Android can crop to circles/squircles without clipping. |
| `android-icon-background.png` | 1024×1024 | Flat `#0A0C10`. |
| `android-icon-monochrome.png` | 1024×1024 | Alpha silhouette, glow thresholded away. Material You tints this, so it must be a clean shape, not a gradient. |
| `splash-icon.png` | 1024×1024 | Ribbon **with** glow at 86%, transparent — `app.json` paints `#F8F9FC` / `#0A0C10` behind it. |
| `favicon.png` | 64×64 | Ribbon at 92%. |
| `logo-mark.png` | 256×177 | Tight crop at the ribbon's own aspect, for in-app chrome. Used by `NivaMark`. |
| `logo-wordmark.png` | 512×101 | Tight crop of the wordmark, flat. Kept as the reference composite; nothing in the app renders it. |
| `logo-wordmark-letters.png` | 512×101 | The `NIVA` letterforms with the dot lifted out. Alpha-only — RGB is flat ink, since it is always tinted. Used by `NivaWordmark`. |
| `logo-wordmark-dot.png` | 512×101 | Just the dot in the `A`, at the artwork's own violet `#8525ED`. Same crop box as the letters layer, so the two stack pixel-aligned. Never tinted. Used by `NivaWordmark`. |

The tight crop is the bounding box of `alpha > 8`, not `alpha > 0` — both masters
carry a very faint halo well outside the artwork, and cropping to it would leave
the mark swimming in dead space.

## In-app usage

- [`NivaMark`](../src/components/brand/NivaMark.tsx) — full-colour, needs no theming; the ribbon holds on both light and obsidian.
- [`NivaWordmark`](../src/components/brand/NivaWordmark.tsx) — two stacked layers. The letterforms are tinted to the theme's ink, since the artwork is near-black and would vanish on obsidian. The dot in the `A` is a separate untinted layer, so it keeps its violet in both themes.

## Regenerating

The generator lives outside the repo (it was a one-off). To redo the set after
changing a master, area-average downscale from the master's alpha bounding box
using the sizes and scale factors in the table above. Then:

```bash
npx expo prebuild --clean --platform android
```

Icons are baked into the native project at prebuild — changing a PNG has no
effect until you regenerate. Note `--clean` also deletes
`android/local.properties`; set `ANDROID_HOME` to `C:\android-sdk` so the SDK
path survives.

## Gradient reference

The ribbon sweeps left to right through four stops, mirrored in
[`src/theme/tokens.ts`](../src/theme/tokens.ts) as `AURORA`:

| Stop | Role | Hex |
|:--|:--|:--|
| Insight | Calm | `#14DBC8` |
| Clarity | Trust | `#3B82F6` |
| Focus | Depth | `#6366F1` |
| Action | Energy | `#A855F7` |
