# assets/model/

**Nothing needs to live here.** Engine weights are no longer bundled into the app.

## Why

The app previously shipped a `needle-q4.gguf` placeholder that was extracted out of
the APK on first launch. That approach never worked and has been removed:

- The bundled file was a 119-byte text placeholder, not a model.
- The native runtime (`libcactus`) does not load GGUF at all — it loads its own
  weight format from a directory.
- Neither published Needle build ships weights the React Native runtime can load.

## How it works now

Engine versions are declared in [`src/model/registry.ts`](../../src/model/registry.ts)
and fetched on demand by [`src/model/ModelManager.ts`](../../src/model/ModelManager.ts)
the first time a user selects them in Settings → Intelligence. Only the version the
user picks is downloaded, which keeps the footprint down on constrained devices.

Weights are cached by the native runtime, so a version is fetched once and switching
back to it later is instant.

## Adding a version

Add an entry to `NIVA_MODELS` in `src/model/registry.ts` with its user-facing name,
tagline and real download size. The `slug` and `quantization` fields are internal and
must never be rendered in the UI.
