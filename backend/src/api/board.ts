import { Hono } from "hono";

import { BOARD_SIZE, DEFAULT_BENCHMARK_SEED_DATE, type BoardView } from "@battleship-arena/shared";

import { renderBoardPng } from "../board/renderer.ts";

import { stableEtag } from "./cache.ts";
import { respondInvalidInput } from "./responses.ts";
import { isValidIsoDate } from "./validation.ts";

interface BoardRouterOptions {
  todayUtc?: () => string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseIfNoneMatchTokens(header: string | undefined): string[] {
  if (header === undefined || header.length === 0) {
    return [];
  }

  if (header.trim() === "*") {
    return ["*"];
  }

  return header
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => (token.startsWith("W/") ? token.slice(2) : token));
}

function ifNoneMatchMatches(header: string | undefined, etag: string): boolean {
  const tokens = parseIfNoneMatchTokens(header);
  if (tokens.includes("*")) {
    return true;
  }

  const normalizedEtag = etag.startsWith("W/") ? etag.slice(2) : etag;

  return tokens.includes(normalizedEtag);
}

function emptyBoardView(): BoardView {
  return {
    size: BOARD_SIZE,
    cells: Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => "unknown"),
  };
}

export function createBoardRouter(options: BoardRouterOptions = {}) {
  const router = new Hono();
  const readToday = options.todayUtc ?? todayUtc;

  router.get("/board", (context) => {
    const explicitDate = context.req.query("date");
    const seedDate = explicitDate ?? DEFAULT_BENCHMARK_SEED_DATE;

    if (!isValidIsoDate(seedDate)) {
      return respondInvalidInput(context);
    }

    if (explicitDate !== undefined && seedDate > readToday()) {
      return respondInvalidInput(context, {
        date: "future",
      });
    }

    const etag = stableEtag(`board:${seedDate}`);
    const cacheControl = "public, max-age=86400, immutable";

    if (ifNoneMatchMatches(context.req.header("If-None-Match"), etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    const png = renderBoardPng(emptyBoardView());
    const body = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": cacheControl,
        ETag: etag,
      },
    });
  });

  return router;
}
