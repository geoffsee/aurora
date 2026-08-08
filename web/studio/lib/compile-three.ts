import ts from 'typescript-legacy';
import {
  type AuroraPackageValidationError,
  validateThreeImports,
} from '../../../shared/aurora-package.ts';

export type ThreeCompileResult =
  | { ok: true; javascript: string; sourceMap?: string; milliseconds: number }
  | { ok: false; errors: AuroraPackageValidationError[]; milliseconds: number };

/** Strict ES2022 ESM transpilation used before preview, publish, and export. */
export function compileThreeSource(source: string): ThreeCompileResult {
  const started = performance.now();
  const errors = validateThreeImports(source);
  const result = ts.transpileModule(source, {
    fileName: 'visualization.ts',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
      sourceMap: true,
      inlineSources: true,
      isolatedModules: true,
    },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    const position =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : null;
    errors.push({
      path: position
        ? `visualization.ts:${position.line + 1}:${position.character + 1}`
        : 'visualization.ts',
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    });
  }
  if (!/\bexport\s+default\b/.test(source))
    errors.push({
      path: 'visualization.ts',
      message: 'must default-export the async visualization factory',
    });
  const milliseconds = performance.now() - started;
  if (errors.length) return { ok: false, errors, milliseconds };
  return { ok: true, javascript: result.outputText, sourceMap: result.sourceMapText, milliseconds };
}
