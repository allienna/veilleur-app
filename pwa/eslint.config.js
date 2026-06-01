import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Constitution §4: TypeScript strict, no `any`, no `@ts-ignore`.
export default tseslint.config(
  { ignores: ["dist", "generated"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
    },
  },
);
