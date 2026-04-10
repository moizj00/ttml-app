// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/**
 * ESLint flat config for the TTML monorepo.
 *
 * Primary goal: enforce pino-compliant logger calling conventions so that the
 * TS2769 overload errors we fixed in the server/ directory cannot creep back in.
 *
 * Pino requires the merge-object to come FIRST:
 *   ✓  logger.error({ err }, "message")
 *   ✗  logger.error("message", err)        ← TS2769 + this rule
 */

// ─── Pino logger anti-pattern rule ───────────────────────────────────────────
// Detects calls of the form:
//   logger.<level>(StringLiteral, <anything>)
//   logger.<level>(TemplateLiteral, <anything>)
// where the first argument is a string/template — the pino-incorrect ordering.
const PINO_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];

const pinoStringFirstSelectors = PINO_LEVELS.flatMap((level) => [
  // logger.level("string", arg)
  `CallExpression[callee.property.name="${level}"][arguments.0.type="Literal"][arguments.0.value=/./][arguments.length>=2]`,
  // logger.level(\`template\`, arg)
  `CallExpression[callee.property.name="${level}"][arguments.0.type="TemplateLiteral"][arguments.length>=2]`,
]);

const pinoRule = {
  selector: pinoStringFirstSelectors.join(", "),
  message:
    "Pino logger requires the merge-object first: logger.level({ err }, 'message'). " +
    "Calling logger.level('message', value) is the wrong overload (TS2769). " +
    "Fix: move the string to the second argument and wrap the data in an object.",
};

export default [
  // ─── Ignore non-source directories ────────────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".pnpm-store/**",
      "drizzle/migrations/**",
      "client/src/**",   // Frontend uses console, not pino — exclude for now
      "e2e/**",
      "scripts/**",
    ],
  },

  // ─── Server TypeScript source files (non-test) ───────────────────────────
  {
    files: ["server/**/*.ts"],
    ignores: ["server/**/*.test.ts", "server/**/__tests__/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // ── Pino logger calling convention ──────────────────────────────────
      "no-restricted-syntax": [
        "error",
        pinoRule,
      ],

      // ── Baseline TypeScript quality rules ───────────────────────────────
      // These are intentionally lightweight — the project relies on tsc for
      // full type checking. We only add rules that catch runtime-relevant bugs.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // ─── Server test files — pino rule only, no project-based parsing ─────────
  {
    files: ["server/**/*.test.ts", "server/**/__tests__/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // No project: true — test files are excluded from tsconfig
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // Still enforce pino convention in test files
      "no-restricted-syntax": [
        "error",
        pinoRule,
      ],
    },
  },
];
