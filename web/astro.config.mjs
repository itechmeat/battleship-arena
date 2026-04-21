import { defineConfig } from "astro/config";
import solidJs from "@astrojs/solid-js";

export default defineConfig({
  output: "static",
  site: "https://staging.arena.example",
  integrations: [solidJs()],
});
