# Version log - 2026-04-20 (S1a)

The versions below are the latest stable values at S1a implementation time, verified against the source of truth listed. Every value is `>= floor` in `docs/spec.md`.

| Package / tool      | Floor (spec)         | Resolved     | Source of truth                                   |
| ------------------- | -------------------- | ------------ | ------------------------------------------------- |
| Bun                 | 1.3.12               | 1.3.13       | https://github.com/oven-sh/bun/releases           |
| Hono                | 4.12.14              | 4.12.14      | https://www.npmjs.com/package/hono                |
| Drizzle ORM         | 0.45.2               | 0.45.2       | https://www.npmjs.com/package/drizzle-orm         |
| Drizzle Kit         | 0.31.10              | 0.31.10      | https://www.npmjs.com/package/drizzle-kit         |
| TypeScript          | 6.0.2                | 6.0.3        | https://www.npmjs.com/package/typescript          |
| Astro               | 6.1.7                | 6.1.8        | https://www.npmjs.com/package/astro               |
| Solid.js            | 1.9.12               | 1.9.12       | https://www.npmjs.com/package/solid-js            |
| @astrojs/solid-js   | (floor with Astro 6) | 6.0.1        | https://www.npmjs.com/package/@astrojs/solid-js   |
| @astrojs/check      | (compatible)         | 0.9.8        | https://www.npmjs.com/package/@astrojs/check      |
| oxlint              | 1.60.0               | 1.61.0       | https://www.npmjs.com/package/oxlint              |
| oxfmt               | 0.45.0               | 0.46.0       | https://www.npmjs.com/package/oxfmt               |
| lefthook            | (latest)             | 2.1.6        | https://www.npmjs.com/package/lefthook            |
| bun-types           | (aligned with Bun)   | 1.3.12       | https://www.npmjs.com/package/bun-types           |
| @types/bun          | (latest)             | 1.3.12       | https://www.npmjs.com/package/@types/bun          |
| Caddy               | 2.x                  | 2.11.2       | https://github.com/caddyserver/caddy/releases     |
| @resvg/resvg-js-cli | (latest published)   | 2.6.2-beta.1 | https://www.npmjs.com/package/@resvg/resvg-js-cli |

The `@resvg/resvg-js-cli` package currently publishes only a beta-tagged release on npm. It is used as a one-off local icon-generation tool rather than a pinned project dependency.
