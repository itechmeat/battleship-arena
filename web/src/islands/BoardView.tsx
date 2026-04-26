import { renderBoardSvg, type RunShotRow } from "@battleship-arena/shared";
import { createMemo } from "solid-js";

import { COLUMN_LABELS, ROW_LABELS } from "./boardCoordinates.ts";
import { boardViewFromShots } from "./boardViewFromShots.ts";
import styles from "./BoardView.module.css";

interface BoardViewProps {
  shots: readonly RunShotRow[];
}

export function BoardView(props: BoardViewProps) {
  const svg = createMemo(() => renderBoardSvg(boardViewFromShots(props.shots)));

  return (
    <div class={styles.root}>
      <div class={styles.columnLabels} aria-hidden="true">
        {COLUMN_LABELS.map((label) => (
          <span class={styles.columnLabel}>{label}</span>
        ))}
      </div>
      <div class={`${styles.columnLabels} ${styles.columnLabelsBottom}`} aria-hidden="true">
        {COLUMN_LABELS.map((label) => (
          <span class={styles.columnLabel}>{label}</span>
        ))}
      </div>
      <div class={styles.rowLabels} aria-hidden="true">
        {ROW_LABELS.map((label) => (
          <span class={styles.rowLabel}>{label}</span>
        ))}
      </div>
      <div class={`${styles.rowLabels} ${styles.rowLabelsRight}`} aria-hidden="true">
        {ROW_LABELS.map((label) => (
          <span class={styles.rowLabel}>{label}</span>
        ))}
      </div>
      <div class={styles.board} innerHTML={svg()} />
    </div>
  );
}

export default BoardView;
