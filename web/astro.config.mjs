import { defineConfig } from "astro/config";
import solidJs from "@astrojs/solid-js";

function localRunShellRewrite() {
  return {
    name: "local-run-shell-rewrite",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method !== "GET" || req.url === undefined) {
          next();
          return;
        }

        const [pathname, search = ""] = req.url.split("?", 2);
        if (pathname === undefined) {
          next();
          return;
        }

        if (/^\/runs\/[^/]+\/?$/.test(pathname) && !/^\/runs\/__dynamic__\/?$/.test(pathname)) {
          req.url = search.length > 0 ? `/runs/__dynamic__?${search}` : "/runs/__dynamic__";
        }

        next();
      });
    },
  };
}

export default defineConfig({
  output: "static",
  site: "https://staging.arena.example",
  integrations: [solidJs()],
  vite: {
    plugins: [localRunShellRewrite()],
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8081",
        },
      },
    },
  },
});
