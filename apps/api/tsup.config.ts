import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "node",
  bundle: true,
  noExternal: ["@life-planner/db", "@life-planner/schemas", "@life-planner/types"],
  outDir: "dist",
  splitting: false,
  clean: true,
  dts: false,
});
