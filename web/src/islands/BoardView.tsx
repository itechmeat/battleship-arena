import { renderBoardSvg, type RunShotRow } from "@battleship-arena/shared";
import { createMemo } from "solid-js";

import { boardViewFromShots } from "./boardViewFromShots.ts";

interface BoardViewProps {
  shots: readonly RunShotRow[];
}

export function BoardView(props: BoardViewProps) {
  const svg = createMemo(() => renderBoardSvg(boardViewFromShots(props.shots)));

  return (
    <div
      style={{
        width: "100%",
        "max-width": "480px",
        "aspect-ratio": "1 / 1",
        margin: "0 auto",
      }}
      innerHTML={svg()}
    />
  );
}

export default BoardView;
