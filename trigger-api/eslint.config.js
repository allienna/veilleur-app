import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Constitution §4: TypeScript strict, no `any`, no `@ts-ignore`.
export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      // Allow intentionally-unused params/vars prefixed with `_` (e.g. interface-method stubs).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
