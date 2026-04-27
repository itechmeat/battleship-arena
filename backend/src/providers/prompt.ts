import type { ProviderCallInput } from "./types.ts";

const COLUMN_LETTERS = "ABCDEFGHIJ";
const BOARD_ROW_RE = /^(\d{2})\s+([.oXS]{10})$/;
const TARGET_MAX_CANDIDATE_CELLS = 12;
const HUNT_MAX_CANDIDATE_CELLS = 12;
const NEIGHBOR_OFFSETS = [-1, 0, 1] as const;

type BoardSymbol = "." | "o" | "X" | "S";
type CandidateMode = "target" | "hunt";

interface CandidateCell {
  cell: string;
  rowIndex: number;
  colIndex: number;
}

interface CandidateCellList {
  mode: CandidateMode;
  cells: string[];
  totalCells: number;
}

function parseBoardSymbols(boardText: string): BoardSymbol[][] {
  const rows: BoardSymbol[][] = [];

  for (const line of boardText.split("\n")) {
    const match = BOARD_ROW_RE.exec(line);
    if (match === null) {
      continue;
    }

    const rowText = match[2];
    if (rowText === undefined) {
      continue;
    }

    rows.push(rowText.split("") as BoardSymbol[]);
  }

  return rows;
}

function cellName(rowIndex: number, colIndex: number): string {
  const columnLetter = COLUMN_LETTERS[colIndex];
  if (columnLetter === undefined) {
    throw new Error(`Column index out of range: ${colIndex}`);
  }

  return `${columnLetter}${rowIndex + 1}`;
}

function addCandidate(
  candidates: CandidateCell[],
  seen: Set<string>,
  rows: readonly BoardSymbol[][],
  rowIndex: number,
  colIndex: number,
): void {
  if (rows[rowIndex]?.[colIndex] !== ".") {
    return;
  }

  if (touchesSunkShip(rows, rowIndex, colIndex)) {
    return;
  }

  const candidate = cellName(rowIndex, colIndex);
  if (seen.has(candidate)) {
    return;
  }

  seen.add(candidate);
  candidates.push({ cell: candidate, rowIndex, colIndex });
}

function touchesSunkShip(
  rows: readonly BoardSymbol[][],
  rowIndex: number,
  colIndex: number,
): boolean {
  for (const rowOffset of NEIGHBOR_OFFSETS) {
    for (const colOffset of NEIGHBOR_OFFSETS) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      if (rows[rowIndex + rowOffset]?.[colIndex + colOffset] === "S") {
        return true;
      }
    }
  }

  return false;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function quadrantFor(candidate: CandidateCell): number {
  const lowerHalf = candidate.rowIndex >= 5 ? 2 : 0;
  const rightHalf = candidate.colIndex >= 5 ? 1 : 0;

  return lowerHalf + rightHalf;
}

function distributeHuntCandidates(
  candidates: readonly CandidateCell[],
  seedDate: string,
): string[] {
  const buckets: CandidateCell[][] = [[], [], [], []];

  for (const candidate of candidates) {
    const bucket = buckets[quadrantFor(candidate)];
    if (bucket !== undefined) {
      bucket.push(candidate);
    }
  }

  for (const bucket of buckets) {
    bucket.sort((left, right) => {
      const leftHash = stableHash(`${seedDate}:${left.cell}`);
      const rightHash = stableHash(`${seedDate}:${right.cell}`);

      return leftHash - rightHash || left.cell.localeCompare(right.cell);
    });
  }

  const startQuadrant = stableHash(`hunt:${seedDate}`) % buckets.length;
  const quadrantOrder = [
    startQuadrant,
    (startQuadrant + 2) % buckets.length,
    (startQuadrant + 1) % buckets.length,
    (startQuadrant + 3) % buckets.length,
  ];
  const ordered: string[] = [];

  while (ordered.length < candidates.length) {
    let addedCandidate = false;

    for (const quadrant of quadrantOrder) {
      const bucket = buckets[quadrant];
      const candidate = bucket?.shift();
      if (candidate === undefined) {
        continue;
      }

      ordered.push(candidate.cell);
      addedCandidate = true;
    }

    if (!addedCandidate) {
      break;
    }
  }

  return ordered;
}

function orderTargetCandidates(candidates: readonly CandidateCell[], seedDate: string): string[] {
  return [...candidates]
    .sort((left, right) => {
      const leftHash = stableHash(`target:${seedDate}:${left.cell}`);
      const rightHash = stableHash(`target:${seedDate}:${right.cell}`);

      return leftHash - rightHash || left.cell.localeCompare(right.cell);
    })
    .map((candidate) => candidate.cell);
}

function firstUnknownCellFromBoardText(boardText: string): string | null {
  const rows = parseBoardSymbols(boardText);

  for (const [rowIndex, rowCells] of rows.entries()) {
    const unknownColumnIndex = rowCells.indexOf(".");
    if (unknownColumnIndex === -1) {
      continue;
    }

    return cellName(rowIndex, unknownColumnIndex);
  }

  return null;
}

function candidateCellsFromBoardText(boardText: string, seedDate: string): CandidateCellList {
  const rows = parseBoardSymbols(boardText);
  const candidates: CandidateCell[] = [];
  const seen = new Set<string>();

  for (const [rowIndex, rowCells] of rows.entries()) {
    for (const [colIndex, symbol] of rowCells.entries()) {
      if (symbol !== "X") {
        continue;
      }

      addCandidate(candidates, seen, rows, rowIndex - 1, colIndex);
      addCandidate(candidates, seen, rows, rowIndex + 1, colIndex);
      addCandidate(candidates, seen, rows, rowIndex, colIndex - 1);
      addCandidate(candidates, seen, rows, rowIndex, colIndex + 1);
    }
  }

  if (candidates.length > 0) {
    const orderedCandidates = orderTargetCandidates(candidates, seedDate);

    return {
      mode: "target",
      cells: orderedCandidates.slice(0, TARGET_MAX_CANDIDATE_CELLS),
      totalCells: orderedCandidates.length,
    };
  }

  for (const [rowIndex, rowCells] of rows.entries()) {
    for (const [colIndex, symbol] of rowCells.entries()) {
      if (symbol === "." && (rowIndex + colIndex) % 2 === 0) {
        addCandidate(candidates, seen, rows, rowIndex, colIndex);
      }
    }
  }

  if (candidates.length > 0) {
    const orderedCandidates = distributeHuntCandidates(candidates, seedDate);

    return {
      mode: "hunt",
      cells: orderedCandidates.slice(0, HUNT_MAX_CANDIDATE_CELLS),
      totalCells: orderedCandidates.length,
    };
  }

  if (candidates.length === 0) {
    for (const [rowIndex, rowCells] of rows.entries()) {
      for (const [colIndex, symbol] of rowCells.entries()) {
        if (symbol === ".") {
          addCandidate(candidates, seen, rows, rowIndex, colIndex);
        }
      }
    }
  }

  const orderedCandidates = distributeHuntCandidates(candidates, seedDate);

  return {
    mode: "hunt",
    cells: orderedCandidates.slice(0, HUNT_MAX_CANDIDATE_CELLS),
    totalCells: orderedCandidates.length,
  };
}

export function buildProviderUserText(input: ProviderCallInput): string {
  const lastLegalShot = input.priorShots.at(-1);
  const consecutiveSchemaErrors = input.consecutiveSchemaErrors ?? 0;
  const candidateList = candidateCellsFromBoardText(input.boardText, input.seedDate);
  const candidateCells = candidateList.cells;
  const emergencyFallbackCell =
    consecutiveSchemaErrors > 0 && candidateList.totalCells === 1
      ? (candidateCells[0] ?? firstUnknownCellFromBoardText(input.boardText))
      : null;
  const candidateListLabel = `${candidateCells.length}, engine-filtered unordered`;
  const candidateGuidance =
    candidateList.mode === "target"
      ? "The game engine already filtered this adjacent-hit frontier, including cells impossible because sunk S ships cannot touch other ships. Order is not a recommendation. Decide direction yourself from the board; do not recompute legality or cells outside the list."
      : "The game engine already filtered this short list, including cells impossible because sunk S ships cannot touch other ships. Order is not a recommendation. Do not recompute ship placements, legality, or cells outside the list.";
  const fleetLines =
    candidateList.mode === "target"
      ? [`Ships still afloat (lengths): ${input.shipsRemaining.join(", ")}`]
      : [];
  const candidateLines =
    candidateCells.length > 0
      ? [
          `Rule-filtered candidate cells for this turn (${candidateListLabel}): ${candidateCells.join(", ")}`,
          candidateGuidance,
          "Choose exactly one cell from the candidate list. Do not choose any cell outside the list.",
        ]
      : [];
  const postSunkLines =
    lastLegalShot?.result === "sunk"
      ? [
          "The last legal shot sank a ship. Treat S cells as finished and unavailable; do not analyze that sunk ship further. Resume exploration among unknown '.' cells with one short heuristic pass.",
        ]
      : [];
  const recoveryLines =
    consecutiveSchemaErrors > 0
      ? [
          `Previous response failed to produce a valid final shot (${consecutiveSchemaErrors} consecutive schema error${consecutiveSchemaErrors === 1 ? "" : "s"}).`,
          ...(emergencyFallbackCell !== null
            ? [
                "Emergency recovery mode: stop strategy analysis for this turn.",
                `Emergency fallback final answer: {"cell":"${emergencyFallbackCell}"}`,
                "Return that exact JSON object now and do not choose any other cell on this turn.",
              ]
            : candidateCells.length > 0
              ? [
                  "Recovery mode: choose exactly one cell from the rule-filtered candidate list yourself. Do not output empty text.",
                ]
              : ["Recovery mode: answer now using the final answer format below."]),
        ]
      : [];

  if (
    consecutiveSchemaErrors > 0 &&
    candidateList.mode === "hunt" &&
    emergencyFallbackCell === null &&
    candidateCells.length > 0
  ) {
    return [
      `Previous response failed to produce a valid final shot (${consecutiveSchemaErrors} consecutive schema error${consecutiveSchemaErrors === 1 ? "" : "s"}).`,
      `Rule-filtered candidate cells for this turn (${candidateListLabel}): ${candidateCells.join(", ")}`,
      "The game engine already filtered this short unordered hunt list, including cells impossible because sunk S ships cannot touch other ships. Order is not a recommendation.",
      "Choose exactly one cell from the candidate list yourself. Do not choose any cell outside the list.",
      'Final answer format: return exactly one JSON object in this shape: {"cell":"<cell>"}. Do not use row/col keys.',
      "Return only the JSON object now. Do not output empty text.",
    ].join("\n");
  }

  return [
    ...fleetLines,
    "No separate shot history is provided; use only the current board symbols.",
    "Unknown cells are exactly '.' on the board. Cells marked o, X, or S are already used and unavailable.",
    ...candidateLines,
    'Final answer format: return exactly one JSON object in this shape: {"cell":"<cell>"}. The value must be one legal unknown cell from the current board. Do not use row/col keys. Do not return empty text.',
    ...postSunkLines,
    ...recoveryLines,
    "Current board:",
    input.boardText,
    "Pick one listed legal candidate cell now. Return only the JSON object specified in the system instructions.",
  ].join("\n");
}
