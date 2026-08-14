import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // commitlint.config.js is a CommonJS tool config shared verbatim across every mailkube SDK
  // (not part of the ESM source).
  // Examples are runnable documentation, not shipped code: excluded from lint here, from the
  // duplication gate in .jscpd.json, and from coverage in vitest.config.ts. This mirrors the
  // python template's `extend-exclude = ["examples"]`.
  // `smoke/` is the same kind of artifact one step further out: those scripts run against the
  // PACKED TARBALL under other runtimes, so they resolve "@mailkube/mailkube-node" (not `../src`), are outside the
  // TS program, and would fail type-aware linting rather than be linted by it.
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "commitlint.config.js",
      "examples/**",
      "smoke/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // strict typing (#6) + SOLID smells (#5)
  sonarjs.configs.recommended, // SOLID / KISS smells (#3/#5)
  jsdoc.configs["flat/recommended-typescript"], // docs (#4)
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      complexity: ["error", 10], // KISS (#3)
      // `flat/recommended-typescript` turns off require-param-type, require-returns-type and
      // require-property-type — the type is in the signature — but leaves require-yields-type on.
      // A generator's yield type is in the signature too (`AsyncGenerator<ScheduledEmail>`), so
      // this restores the preset's own rule rather than relaxing it.
      "jsdoc/require-yields-type": "off",
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
        },
      ],
    },
  },
  {
    // Config + build scripts are not part of the TS program — no type-aware linting.
    files: ["**/*.{js,cjs,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Tests relax docs + complexity: a test's name is its documentation, and table-driven cases
    // are repetitive by nature.
    files: ["test/**", "**/*.test.ts"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      complexity: "off",
      "sonarjs/no-duplicate-string": "off",
      // Test fixtures need realistic-looking fake secrets.
      "sonarjs/hardcoded-secret-signatures": "off",
    },
  },
);
