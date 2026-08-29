/**
 * Niva engine catalogue.
 *
 * Users only ever see the Niva version name, its tagline and its download
 * size. The underlying vendor model, quantization and download host are
 * internal details and must never reach the UI — PRD_Needle is explicit:
 * "No confidence scores, model names, or JSON in the UI — ever."
 *
 * Sizes below are the real on-disk download sizes for the runtime-compatible
 * weight builds, verified against the engine registry. Keep them accurate:
 * they are the only storage signal a user gets before committing to a fetch.
 */

export type NivaModelId = 'niva-2' | 'niva-2-pro' | 'niva-1';

export interface NivaModel {
  id: NivaModelId;
  /** User-facing name. */
  name: string;
  /** One-line description shown beneath the name. */
  tagline: string;
  /** Download size in MB. Shown to the user as a storage hint. */
  sizeMb: number;
  /** Internal engine slug — never render this. */
  slug: string;
  /** Internal weight variant — never render this. */
  quantization: 'int4' | 'int8';
}

/**
 * Ordered newest-first. The first entry is the default for a fresh install.
 * Note the newest engine is also the smallest, so the default is already the
 * most storage-friendly choice; the alternatives trade space for accuracy.
 */
export const NIVA_MODELS: NivaModel[] = [
  {
    id: 'niva-2',
    name: 'Niva 2',
    tagline: 'Latest engine. Best balance of speed, accuracy and size.',
    sizeMb: 199,
    slug: 'lfm2.5-350m',
    quantization: 'int4',
  },
  {
    id: 'niva-2-pro',
    name: 'Niva 2 Pro',
    tagline: 'Sharper at pulling out amounts and dates. Needs more space.',
    sizeMb: 263,
    slug: 'functiongemma-270m-it',
    quantization: 'int8',
  },
  {
    id: 'niva-1',
    name: 'Niva 1',
    tagline: 'Previous generation. Keep if Niva 2 misreads your messages.',
    sizeMb: 199,
    slug: 'lfm2-350m',
    quantization: 'int4',
  },
];

export const DEFAULT_MODEL_ID: NivaModelId = NIVA_MODELS[0].id;

export function getModel(id: string): NivaModel {
  return NIVA_MODELS.find((m) => m.id === id) ?? NIVA_MODELS[0];
}

export function isNivaModelId(id: string): id is NivaModelId {
  return NIVA_MODELS.some((m) => m.id === id);
}

/** Storage hint for the UI, e.g. "199 MB" / "1.2 GB". */
export function formatSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}
