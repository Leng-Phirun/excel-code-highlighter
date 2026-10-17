import js from "@eslint/js";
import officeAddins from "eslint-plugin-office-addins";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Office.js correctness rules (load before read, sync after load, null objects, ...).
    files: ["src/**/*.ts"],
    plugins: { "office-addins": officeAddins },
    rules: {
      "office-addins/call-sync-after-load": "error",
      "office-addins/call-sync-before-read": "error",
      "office-addins/load-object-before-read": "error",
      "office-addins/no-context-sync-in-loop": "warn",
      "office-addins/no-empty-load": "error",
      "office-addins/no-navigational-load": "error",
      "office-addins/no-office-initialize": "error",
      "office-addins/test-for-null-using-isNullObject": "error",
    },
  },
  {
    files: ["webpack.config.js"],
    languageOptions: { sourceType: "commonjs", globals: { require: "readonly", module: "writable", process: "readonly", __dirname: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  }
);
