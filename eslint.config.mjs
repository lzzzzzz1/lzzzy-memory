import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "dist/**",
    "out/**",
    "build/**",
    "work/**",
    "node_modules.incomplete/**",
    "next-env.d.ts",
    "public/cesium/**",
  ]),
]);
