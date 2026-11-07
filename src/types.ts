export type Severity = 'error' | 'warning' | 'info';

/** Which engine produced a diagnostic. */
export type Engine = 'npm' | 'pinets' | 'oracle-params' | 'oracle';

export interface Diagnostic {
  severity: Severity;
  /** Engine that emitted it — useful for --engine filtering and debugging. */
  engine: Engine;
  /** 1-based line, 0 when unknown. */
  line: number;
  /** 1-based column, 0 when unknown. */
  column: number;
  /** Diagnostic length in characters (for editor squiggles), 0 when unknown. */
  length?: number;
  message: string;
}

export interface CheckResult {
  diagnostics: Diagnostic[];
  /** Engine-level notes that are not diagnostics (e.g. PineTS skipped). */
  meta?: Record<string, unknown>;
}
