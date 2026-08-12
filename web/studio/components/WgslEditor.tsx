import { Box, Text } from '@chakra-ui/react';
import Editor from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import type { WgslDiagnostic } from '../lib/wgsl-diagnostics.ts';

type MonacoType = any;
type MonacoEditor = any;

const WGSL_LANG = 'wgsl';
let languageConfigured = false;

const WGSL_KEYWORDS = [
  'alias',
  'bitcast',
  'block',
  'break',
  'case',
  'const',
  'const_assert',
  'continue',
  'continuing',
  'discard',
  'else',
  'enable',
  'fn',
  'for',
  'if',
  'let',
  'loop',
  'override',
  'requires',
  'return',
  'struct',
  'switch',
  'var',
  'while',
];

const WGSL_TYPES = [
  'i32',
  'u32',
  'f32',
  'f16',
  'bool',
  'vec2',
  'vec3',
  'vec4',
  'mat2x2',
  'mat2x3',
  'mat2x4',
  'mat3x2',
  'mat3x3',
  'mat3x4',
  'mat4x2',
  'mat4x3',
  'mat4x4',
  'array',
  'ptr',
  'atomic',
  'bitcast',
  'texture_2d',
  'texture_2d_array',
  'texture_storage_2d',
  'texture_storage_2d_array',
  'texture_3d',
  'sampler',
  'sampler_comparison',
];

const WGSL_BUILTINS = [
  'abs',
  'acos',
  'acosh',
  'all',
  'any',
  'asin',
  'asinh',
  'atan',
  'atan2',
  'atanh',
  'ceil',
  'clamp',
  'cos',
  'cosh',
  'countLeadingZeros',
  'countOneBits',
  'countTrailingZeros',
  'cross',
  'degrees',
  'determinant',
  'dot',
  'exp',
  'exp2',
  'floor',
  'fract',
  'inverseSqrt',
  'length',
  'log',
  'log2',
  'max',
  'min',
  'mix',
  'modf',
  'normalize',
  'pow',
  'radians',
  'reflect',
  'select',
  'sign',
  'sin',
  'sinh',
  'smoothstep',
  'sqrt',
  'step',
  'tan',
  'tanh',
  'textureSample',
  'textureSampleBias',
  'textureSampleLevel',
  'textureLoad',
  'textureStore',
];

const WGSL_SNIPPETS: ReadonlyArray<{ label: string; insertText: string; detail: string }> = [
  {
    label: 'fn',
    insertText: 'fn ${1:name}(${2:params}) -> ${3:void} {\n  $0\n}',
    detail: 'WGSL function',
  },
  {
    label: 'struct',
    insertText: 'struct ${1:Name} {\n  ${2:field}: ${3:type},\n}',
    detail: 'WGSL struct',
  },
  {
    label: 'let',
    insertText: 'let ${1:name}: ${2:type} = ${3:value};',
    detail: 'WGSL let binding',
  },
  {
    label: 'var',
    insertText: 'var<${1:storage}> ${2:name}: ${3:type} = ${4:value};',
    detail: 'WGSL variable declaration',
  },
  {
    label: 'for',
    insertText: 'for (var i: i32 = 0; i < ${1:count}; i++) {\n  ${2:// body}\n}',
    detail: 'WGSL for loop',
  },
  {
    label: 'if',
    insertText: 'if (${1:condition}) {\n  ${2:// body}\n}',
    detail: 'WGSL if block',
  },
  {
    label: 'switch',
    insertText: 'switch(${1:expr}) {\n  case ${2:0}: {\n    ${3:// body}\n  }\n}',
    detail: 'WGSL switch block',
  },
];

const WGSL_COMPLETIONS = (monaco: MonacoType) => [
  ...WGSL_KEYWORDS.map((keyword) => ({
    label: keyword,
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: keyword,
    detail: 'keyword',
    sortText: `0_${keyword}`,
  })),
  ...WGSL_TYPES.map((typeName) => ({
    label: typeName,
    kind: monaco.languages.CompletionItemKind.TypeParameter,
    insertText: typeName,
    detail: 'WGSL type',
    sortText: `1_${typeName}`,
  })),
  ...WGSL_BUILTINS.map((builtin) => ({
    label: builtin,
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: `${builtin}($1)`,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'WGSL builtin',
    sortText: `2_${builtin}`,
  })),
  ...WGSL_SNIPPETS.map((snippet) => ({
    label: snippet.label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: snippet.insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: snippet.detail,
    sortText: `3_${snippet.label}`,
    documentation: `${snippet.label} snippet`,
  })),
];

function configureWgslLanguage(monaco: MonacoType): void {
  if (languageConfigured) return;
  languageConfigured = true;

  monaco.languages.register({
    id: WGSL_LANG,
    extensions: ['.wgsl'],
    aliases: ['WGSL'],
    mimetypes: ['text/wgsl'],
  });

  monaco.languages.setMonarchTokensProvider(WGSL_LANG, {
    tokenizer: {
      root: [
        [/@[a-zA-Z0-9_]+\b/, 'annotation'],
        [
          /\b(alias|bitcast|break|case|const|const_assert|continue|continuing|discard|else|enable|fn|for|if|loop|let|override|requires|return|struct|switch|var|while|case|default)\b/,
          'keyword',
        ],
        [
          /\b(vec2|vec3|vec4|mat2x2|mat2x3|mat2x4|mat3x2|mat3x3|mat3x4|mat4x2|mat4x3|mat4x4|i32|u32|f32|f16|bool|array|ptr|atomic|texture_2d|texture_2d_array|texture_3d|texture_storage_2d|texture_storage_2d_array|sampler|sampler_comparison)\b/,
          'type',
        ],
        [
          /\b(abs|acos|acosh|all|any|asin|asinh|atan|atan2|atanh|ceil|clamp|cos|cosh|countLeadingZeros|countOneBits|countTrailingZeros|cross|degrees|determinant|dot|exp|exp2|floor|fract|inverseSqrt|length|log|log2|max|min|mix|modf|normalize|pow|radians|reflect|select|sign|sin|sinh|smoothstep|sqrt|step|tan|tanh|textureSample|textureSampleBias|textureSampleLevel|textureLoad|textureStore)\b/,
          'predefined',
        ],
        [/\b\d+(\.\d+)?(e[+-]?\d+)?\b/, 'number'],
        [/\/\/.*$/, 'comment'],
        [/"[^"]*"/, 'string'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(WGSL_LANG, {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(if|loop|for|while|switch|struct)\b.*\{\s*$/,
      decreaseIndentPattern: /^\s*[}\]]/,
    },
    folding: {
      markers: {
        start: '^\\s*//\\s*#region\\b',
        end: '^\\s*//\\s*#endregion\\b',
      },
    },
  });

  monaco.languages.registerCompletionItemProvider(WGSL_LANG, {
    triggerCharacters: ['.', ':', '(', '{', '[', ' '],
    provideCompletionItems: () => ({
      suggestions: WGSL_COMPLETIONS(monaco),
    }),
  });

  monaco.editor.defineTheme('aurora-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'annotation', foreground: '8EC07C' },
      { token: 'keyword', foreground: '80D0FF' },
      { token: 'type', foreground: 'DFAF8C' },
      { token: 'predefined', foreground: '9CDCFE' },
      { token: 'comment', foreground: '928374', fontStyle: 'italic' },
      { token: 'number', foreground: 'D3869B' },
    ],
    colors: {
      'editor.background': '#0c0e12',
      'editorBracketMatch.background': '#0c2f4a80',
      'editorBracketMatch.border': '#6ea8ff',
      'editorBracketHighlight.foreground1': '#6ea8ff',
    },
  });
}

function toMonacoMarkers(monaco: MonacoType, diagnostics: readonly WgslDiagnostic[] = []) {
  return diagnostics.map((diagnostic) => {
    const line = Math.max(1, diagnostic.lineNumber);
    const startColumn = Math.max(1, diagnostic.startColumn);
    return {
      startLineNumber: line,
      endLineNumber: Math.max(line, diagnostic.endLineNumber ?? line),
      startColumn,
      endColumn: Math.max(startColumn + 1, diagnostic.endColumn ?? startColumn + 1),
      message: diagnostic.message || 'WGSL error',
      severity:
        diagnostic.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : diagnostic.severity === 'info'
            ? monaco.MarkerSeverity.Info
            : monaco.MarkerSeverity.Error,
      source: 'WGSL',
    };
  });
}

export function WgslEditor({
  value,
  onChange,
  diagnostics,
  backend = 'wgsl',
  registerSelectionReader,
}: {
  value: string;
  onChange: (next: string) => void;
  diagnostics?: readonly WgslDiagnostic[];
  backend?: 'wgsl' | 'threejs';
  /**
   * Hands the caller a pull-based reader for the current selection (#289).
   * Pull rather than a change event: the copilot needs the selection once, at
   * submit time, and an onSelectionChange would re-render the panel on every
   * cursor move for a value nothing is displaying.
   */
  registerSelectionReader?: (read: () => string) => void;
}) {
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<MonacoType | null>(null);
  const handleChange = useCallback(
    (next: string = '') => {
      onChange(next);
    },
    [onChange],
  );

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      'wgsl',
      backend === 'wgsl' ? toMonacoMarkers(monaco, diagnostics) : [],
    );
  }, [backend, diagnostics]);

  return (
    <Box h="100%" display="flex" flexDirection="column" gap={2}>
      <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" color="whiteAlpha.700">
        {backend === 'threejs'
          ? 'TypeScript · three-v1 · trusted same-origin code'
          : 'WGSL · pack-v1'}
      </Text>
      <Box className="studio-editor" h="100%">
        <Editor
          language={backend === 'threejs' ? 'typescript' : WGSL_LANG}
          theme="aurora-dark"
          value={value}
          onChange={(_value: string | undefined) => handleChange(_value ?? '')}
          beforeMount={(monaco: MonacoType) => {
            configureWgslLanguage(monaco);
            monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
              target: monaco.languages.typescript.ScriptTarget.ES2022,
              module: monaco.languages.typescript.ModuleKind.ESNext,
              strict: true,
              noEmit: true,
            });
          }}
          onMount={(editor: MonacoEditor, monaco: MonacoType) => {
            editorRef.current = editor;
            registerSelectionReader?.(() => {
              const selection = editor.getSelection();
              if (!selection || selection.isEmpty()) return '';
              return editor.getModel()?.getValueInRange(selection) ?? '';
            });
            monacoRef.current = monaco;
            monaco.editor.setTheme('aurora-dark');
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            formatOnPaste: true,
            formatOnType: true,
            smoothScrolling: false,
            mouseWheelZoom: false,
            quickSuggestions: { other: true, strings: false, comments: false },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            wordBasedSuggestions: 'off',
            tabCompletion: 'off',
            snippetSuggestions: 'top',
            matchBrackets: 'always',
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            autoClosingDelete: 'always',
            autoIndent: 'full',
            bracketPairColorization: {
              enabled: true,
              independentColorPoolPerBracketType: true,
            },
            folding: true,
            foldingStrategy: 'indentation',
            renderLineHighlight: 'all',
            showFoldingControls: 'always',
            guides: {
              bracketPairs: true,
              bracketPairsHorizontal: true,
              highlightActiveIndentation: true,
              indentation: true,
            },
            suggestSelection: 'first',
            unicodeHighlight: {
              ambiguousCharacters: false,
              invisibleCharacters: false,
            },
            parameterHints: { enabled: true },
          }}
        />
      </Box>
      <Text fontSize="11px" color="whiteAlpha.500">
        Authoring form uses @group(0). Export remaps to Bevy @group(2) + VertexOutput on import when
        needed.
      </Text>
    </Box>
  );
}
