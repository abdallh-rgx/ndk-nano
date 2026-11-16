/**
 * Types mirroring src/data/pipeline-state.json — the exact schema the real
 * pipeline will later produce on GitHub Actions. All measured values are
 * nullable until the first real run lands (source === "pending").
 */

export interface PipelineMeta {
  ndk_version: string;
  abi: string;
  host: string;
  generated_at: string | null;
  source: string | null;
}

export interface FetchStage {
  zip_mb: number | null;
  extracted_mb: number | null;
}

export interface PruneStage {
  before_mb: number | null;
  after_mb: number | null;
  removed_files: number | null;
  stripped_binaries: number | null;
}

/** Shape of a real asm sample produced by 03_manifest.py (snake_case, from JSON). */
export interface AsmSampleEntry {
  bytes: number;
  sha: string;
  text: string;
  minimized_text: string;
  removable_lines: number[];
}

export interface ManifestStage {
  headers_total: number | null;
  headers_ok: number | null;
  headers_failed: number | null;
  asm_bytes_total: number | null;
  macros_total: number | null;
  asm_samples: Record<string, AsmSampleEntry>;
}

export interface Z3Stage {
  solver: string | null;
  required_symbols: string[];
  kept_files: number | null;
  dropped_files: number | null;
  bytes_total: number | null;
  bytes_kept_mb: number | null;
  bytes_saved_mb: number | null;
  solve_ms: number | null;
  greedy_kept_mb: number | null;
  asm_rules_verified: number | null;
  asm_rules_occurrences: number | null;
  asm_est_bytes_saved: number | null;
}

export interface PackStage {
  format: string | null;
  package_mb: number | null;
  tailored_mb: number | null;
  ratio: number | null;
  budget_mb: number;
  within_budget: boolean | null;
}

export interface VerifyProject {
  name: string;
  tree: string;
  status: string;
  artifact: string;
  machine: string;
}

export interface VerifyStage {
  mode: string | null;
  projects: VerifyProject[];
}

export interface PipelineStages {
  fetch: FetchStage;
  prune: PruneStage;
  manifest: ManifestStage;
  z3: Z3Stage;
  pack: PackStage;
  verify: VerifyStage;
}

export interface PipelineState {
  meta: PipelineMeta;
  stages: PipelineStages;
}
