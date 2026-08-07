export type WgslSeverity = 'error' | 'warning' | 'info';

export type WgslDiagnostic = {
  lineNumber: number;
  startColumn: number;
  endLineNumber?: number;
  endColumn?: number;
  message: string;
  severity: WgslSeverity;
};
