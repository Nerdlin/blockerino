import { Color } from "./Color";
import { getRandomPieceColor, PieceData } from "./Piece";
import { Platform, useWindowDimensions } from 'react-native';
import { useAppStateValue, MenuStateType } from "@/hooks/useAppState";
import { Hand, makeSeededPrng } from "./Hand";

export interface GameSizeInput {
  width: number;
  height: number;
  boardLength: number;
  isMultiplayer?: boolean;
}

// A dragged piece floats above the finger so the finger does not hide it. A mouse pointer hides nothing, and a piece
// floating a hand-width above the cursor looks as if it was grabbed off-centre, so with a mouse it stays under the cursor.
const HAS_FINE_POINTER = Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function"
  && window.matchMedia("(pointer: fine)").matches;

export function calculateGameSizes({
  width,
  height,
  boardLength,
  isMultiplayer = false,
}: GameSizeInput) {
  const isMobile = width < 600 || height < 760;
  const horizontalPadding = isMobile ? 24 : 32;
  const maxGridWidth = Math.max(160, width - horizontalPadding);
  const calculatedBlockSizeWidth = Math.floor(maxGridWidth / boardLength);

  const reservedHeight = isMultiplayer
    ? (isMobile ? (boardLength === 10 ? 560 : 515) : 390)
    : (isMobile ? (boardLength === 10 ? 300 : 250) : 280);
  const maxGridHeight = Math.max(160, height - reservedHeight);
  const calculatedBlockSizeHeight = Math.floor(maxGridHeight / boardLength);

  const isLargeScreen = width >= 900 && height >= 900;
  const idealBlockSize = isMobile && isMultiplayer ? 42 : (isLargeScreen ? 64 : 46);
  const minBlockSize = isMobile && isMultiplayer ? 16 : 18;
  const gridBlockSize = Math.max(
    minBlockSize,
    Math.min(idealBlockSize, calculatedBlockSizeWidth, calculatedBlockSizeHeight)
  );

  const scaleRatio = gridBlockSize / 46;
  let handScale = isMobile && boardLength === 10 ? 0.62 : (isMobile ? 0.72 : 1.0);

  // A solo phone game is usually limited by the width, so a tall screen has room left under the board. The hand
  // takes part of it: bigger pieces (never wider than the screen, never bigger than the desktop hand) and a wider gap
  // under the board. Only the size of the hand changes; the drag maths reads the measured layouts.
  const spareHeight = Math.max(0, maxGridHeight - gridBlockSize * boardLength);
  let handGap: number | null = null;
  if (isMobile && !isMultiplayer) {
    const handCount = boardLength === 10 ? 5 : 3;
    const baseSlot = 5 * 22 * scaleRatio * handScale;
    // up to 0.7 of a board cell per hand block, and never wider than the screen allows for the whole hand
    const maxSlot = Math.min((width - 16) / handCount, 5 * 0.7 * gridBlockSize);
    const wantedSlot = baseSlot + spareHeight * 0.8;
    const slot = Math.max(baseSlot, Math.min(wantedSlot, maxSlot));
    handScale *= slot / baseSlot;
    // the hand sits in the middle of the free space under the board: what the bigger pieces take is not free any more
    const freeAfterGrowth = Math.max(0, spareHeight - (slot - baseSlot));
    handGap = Math.min(110, 26 + freeAfterGrowth * 0.5);
  }

  return {
    GRID_BLOCK_SIZE: gridBlockSize,
    HAND_GAP: handGap,
    HAND_BLOCK_SIZE: 22 * scaleRatio * handScale,
    HITBOX_SIZE: Math.max(6, 12 * scaleRatio),
    DRAG_JUMP_LENGTH: HAS_FINE_POINTER ? 0 : 116 * scaleRatio
  };
}

export function useGameSizes(boardLength: number) {
  const { width, height } = useWindowDimensions();
  const appState = useAppStateValue();
  const isMultiplayer = Boolean(appState?.containsState(MenuStateType.MULTIPLAYER_GAME));

  return calculateGameSizes({
    width,
    height,
    boardLength,
    isMultiplayer,
  });
}

export interface XYPoint {
  x: number;
  y: number;
}

export enum BoardBlockType {
  EMPTY,
  HOVERED,
  HOVERED_BREAK_FILLED,
  HOVERED_BREAK_EMPTY,
  FILLED,
}

export interface BoardBlock {
  blockType: BoardBlockType;
  color: Color;
  hoveredBreakColor: Color;
}

export type Board = BoardBlock[][];

export interface ClearedLines {
  rows: number[];
  columns: number[];
}

export type PlacementPreview = XYPoint & ClearedLines;

export function cloneBoard(board: Board): Board {
  "worklet";
  return board.map((row) => row.map((cell) => ({
    blockType: cell.blockType,
    color: { ...cell.color },
    hoveredBreakColor: { ...cell.hoveredBreakColor },
  })));
}

export function newEmptyBoard(boardLength: number): Board {
  return new Array(boardLength).fill(null).map(() => {
    return new Array(boardLength).fill(null).map(() => {
      return {
        blockType: BoardBlockType.EMPTY,
        color: getRandomPieceColor(), // used in the load up animation where blocks show on the grid
        hoveredBreakColor: { r: 0, g: 0, b: 0 },
      };
    });
  });
}

export function createSeededBoard(boardLength: number, seedNum: number, minBlocks: number = 10, maxBlocks: number = 15): Board {
  const board = newEmptyBoard(boardLength);
  const prng = makeSeededPrng(seedNum);
  
  // Prefill with 10 to 15 blocks
  const numBlocks = prng.nextInt(minBlocks, maxBlocks);
  
  const rowCounts = new Array(boardLength).fill(0);
  const colCounts = new Array(boardLength).fill(0);
  
  const colors = [
    { r: 227, g: 143, b: 16 },
    { r: 186, g: 19, b: 38 },
    { r: 16, g: 158, b: 40 },
    { r: 20, g: 56, b: 184 },
    { r: 101, g: 19, b: 148 },
    { r: 31, g: 165, b: 222 }
  ];

  let placed = 0;
  let attempts = 0;
  while (placed < numBlocks && attempts < 1000) {
    attempts++;
    const x = prng.nextInt(0, boardLength - 1);
    const y = prng.nextInt(0, boardLength - 1);
    
    if (board[y][x].blockType === BoardBlockType.EMPTY) {
      if (rowCounts[y] < boardLength - 2 && colCounts[x] < boardLength - 2) {
        const colorIdx = prng.nextInt(0, colors.length - 1);
        board[y][x].blockType = BoardBlockType.FILLED;
        board[y][x].color = colors[colorIdx];
        rowCounts[y]++;
        colCounts[x]++;
        placed++;
      }
    }
  }
  return board;
}

export type PossibleBoardSpots = number[][];

export function emptyPossibleBoardSpots(
  boardLength: number,
): PossibleBoardSpots {
  "worklet";
  return new Array(boardLength).fill(null).map(() => {
    return new Array(boardLength).fill(null).map(() => {
      return 0;
    });
  });
}

export function JS_emptyPossibleBoardSpots(
  boardLength: number,
): PossibleBoardSpots {
  return new Array(boardLength).fill(null).map(() => {
    return new Array(boardLength).fill(null).map(() => {
      return 0;
    });
  });
}
export function canPlacePiece(board: Board, piece: PieceData, x: number, y: number): boolean {
  "worklet";
  const height = piece.matrix.length;
  const width = piece.matrix[0].length;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + width > board.length || y + height > board.length) return false;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (piece.matrix[row][col] === 1 && board[y + row][x + col].blockType === BoardBlockType.FILLED) return false;
    }
  }
  return true;
}

export function createPossibleBoardSpots(
  board: Board,
  piece: PieceData | null,
): PossibleBoardSpots {
  "worklet";
  const boardLength = board.length;
  if (piece == null) {
    return [];
  }
  const pieceHeight = piece.matrix.length;
  const pieceWidth = piece.matrix[0].length;
  const fitPositions: PossibleBoardSpots = emptyPossibleBoardSpots(boardLength);

  for (let boardY = 0; boardY <= boardLength - pieceHeight; boardY++) {
    for (let boardX = 0; boardX <= boardLength - pieceWidth; boardX++) {
      if (canPlacePiece(board, piece, boardX, boardY)) {
        fitPositions[boardY][boardX] = 1;
      }
    }
  }

  return fitPositions;
}

export function hasAnyPossibleMove(board: Board, hand: Hand): boolean {
  "worklet";
  for (let i = 0; i < hand.length; i++) {
    const piece = hand[i];
    if (!piece) continue;

    for (let y = 0; y <= board.length - piece.matrix.length; y++) {
      for (let x = 0; x <= board.length - piece.matrix[0].length; x++) {
        if (canPlacePiece(board, piece, x, y)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function clearHoverBlocks(board: Board): Board {
  "worklet";
  const boardLength = board.length;
  for (let y = 0; y < boardLength; y++) {
    for (let x = 0; x < boardLength; x++) {
      const blockType = board[y][x].blockType;
      if (
        blockType === BoardBlockType.HOVERED ||
        blockType === BoardBlockType.HOVERED_BREAK_EMPTY
      ) {
        board[y][x].blockType = BoardBlockType.EMPTY;
      } else if (blockType === BoardBlockType.HOVERED_BREAK_FILLED) {
        board[y][x].blockType = BoardBlockType.FILLED;
      }
    }
  }
  return board;
}

export function placePieceOntoBoard(
  board: Board,
  piece: PieceData,
  dropX: number,
  dropY: number,
  blockType: BoardBlockType,
) {
  "worklet";
  for (let y = 0; y < piece.matrix.length; y++) {
    for (let x = 0; x < piece.matrix[0].length; x++) {
      if (piece.matrix[y][x] >= 1) {
        board[dropY + y][dropX + x].blockType = blockType;
        board[dropY + y][dropX + x].color = piece.color;
      }
    }
  }
}

export function getPlacementPreview(board: Board, piece: PieceData, x: number, y: number): PlacementPreview {
  "worklet";
  const rows: number[] = [];
  const columns: number[] = [];
  const matrix = piece.matrix;

  // Only lines that intersect this piece can become full.
  for (let row = y; row < y + matrix.length; row++) {
    if (board[row].every((cell, col) => cell.blockType === BoardBlockType.FILLED || matrix[row - y][col - x] >= 1)) {
      rows.push(row);
    }
  }
  for (let col = x; col < x + matrix[0].length; col++) {
    if (board.every((row, i) => row[col].blockType === BoardBlockType.FILLED || (matrix[i - y]?.[col - x] ?? 0) >= 1)) {
      columns.push(col);
    }
  }
  return { x, y, rows, columns };
}

export function breakLines(board: Board, cleared?: ClearedLines): number {
  "worklet";
  const boardLength = board.length;
  const rowsToClear = new Set<number>();
  const colsToClear = new Set<number>();

  for (let row = 0; row < boardLength; row++) {
    if (board[row].every((cell) => cell.blockType === BoardBlockType.FILLED)) {
      rowsToClear.add(row);
    }
  }

  for (let col = 0; col < boardLength; col++) {
    if (board.every((row) => row[col].blockType === BoardBlockType.FILLED)) {
      colsToClear.add(col);
    }
  }

  const count = rowsToClear.size + colsToClear.size;
  if (cleared && count > 0) {
    cleared.rows = Array.from(rowsToClear);
    cleared.columns = Array.from(colsToClear);
  }

  if (count > 0) {
    rowsToClear.forEach((row) => {
      for (let col = 0; col < boardLength; col++) {
        board[row][col].blockType = BoardBlockType.EMPTY;
      }
    });

    colsToClear.forEach((col) => {
      for (let row = 0; row < boardLength; row++) {
        board[row][col].blockType = BoardBlockType.EMPTY;
      }
    });
  }

  return count;
}

export function isBoardEmpty(board: Board): boolean {
  "worklet";
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      if (board[row][col].blockType !== BoardBlockType.EMPTY) return false;
    }
  }
  return true;
}

export function forEachBoardBlock(board: Board, each: ((block: BoardBlock, x: number, y: number) => boolean) | ((block: BoardBlock, x: number, y: number) => void)) {
  const length = board.length;
  for (let y = 0; y < length; y++) {
    for (let x = 0; x < length; x++) {
      each(board[y][x], x, y);
    }
  }
}
