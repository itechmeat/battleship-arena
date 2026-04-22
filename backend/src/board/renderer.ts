import { Resvg } from "@resvg/resvg-js";

import { renderBoardSvg, type BoardView } from "@battleship-arena/shared";

export function renderBoardPng(view: BoardView): Uint8Array {
  return Uint8Array.from(new Resvg(renderBoardSvg(view)).render().asPng());
}
