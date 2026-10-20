module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  ignorePatterns: ["**/dist/**", "**/.next/**", "**/node_modules/**", ".omx/**", "apps/site/next-env.d.ts"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  overrides: [
    {
      files: ["apps/site/**/*.ts", "apps/site/**/*.tsx", "packages/browser-renderer/**/*.ts"],
      env: { browser: true, node: true },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  ],
};
