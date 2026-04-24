import { Hono } from "hono";

import { BOARD_SIZE, type BoardView } from "@battleship-arena/shared";

import { renderBoardPng } from "../board/renderer.ts";
import { respondError } from "../errors.ts";

import { stableEtag } from "./cache.ts";

interface BoardRouterOptions {
  todayUtc?: () => string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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
    const seedDate = explicitDate ?? readToday();

    if (!isValidDate(seedDate)) {
      return respondError(context, "invalid_input", 400, "Invalid input");
    }

    if (seedDate > readToday()) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        date: "future",
      });
    }

    const etag = stableEtag(`board:${seedDate}`);
    const cacheControl =
      explicitDate === undefined ? "no-cache, must-revalidate" : "public, max-age=86400, immutable";

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
