import { Hono } from "hono";

import { listProviderCatalog } from "../pricing/catalog.ts";

import { weakJsonEtag } from "./cache.ts";

export function createProvidersRouter() {
  const router = new Hono();
  const responseBody = { providers: listProviderCatalog() };
  const etag = weakJsonEtag(responseBody);
  const cacheControl = "public, max-age=60";

  router.get("/providers", (context) => {
    context.header("Cache-Control", cacheControl);
    context.header("ETag", etag);

    if (context.req.header("If-None-Match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    return context.json(responseBody, 200);
  });

  return router;
}
