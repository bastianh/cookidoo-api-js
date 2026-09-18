// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "packages/cookidoo-api-js/src/localization.json",
      "packages/node-red-cookidoo/nodes/*.html",
      "packages/node-red-fcm/nodes/*.html",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Core library: TypeScript, ESM, runs under Node.
    files: ["packages/cookidoo-api-js/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Node-RED nodes: plain CommonJS, injected `RED` runtime global.
    // `require()` is how Node-RED itself loads node modules, and aliasing
    // `this` to `node` is the standard pattern in every Node-RED node.
    files: ["packages/node-red-cookidoo/**/*.js", "packages/node-red-fcm/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node, RED: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-this-alias": "off",
    },
  },
  {
    files: ["**/*.config.{js,ts}", "**/vitest.config.ts", "scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
