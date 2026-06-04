import { Color } from "./Color";
import { getRandomPieceColor, PieceData } from "./Piece";
import { useWindowDimensions } from 'react-native';
import { useAppStateValue, MenuStateType } from "@/hooks/useAppState";
import { Hand, makeSeededPrng } from "./Hand";

export interface GameSizeInput {
  width: number;
  height: number;
  boardLength: number;
  isMultiplayer?: boolean;
}

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
    ? (isMobile ? (boardLength === 10 ? 500 : 450) : 390)
    : (isMobile ? (boardLength === 10 ? 300 : 250) : 280);
  const maxGridHeight = Math.max(160, height - reservedHeight);
  const calculatedBlockSizeHeight = Math.floor(maxGridHeight / boardLength);

  const idealBlockSize = isMobile && isMultiplayer ? 42 : 46;
  const minBlockSize = isMobile && isMultiplayer ? 16 : 18;
  const gridBlockSize = Math.max(
    minBlockSize,
    Math.min(idealBlockSize, calculatedBlockSizeWidth, calculatedBlockSizeHeight)
  );

  const scaleRatio = gridBlockSize / 46;
  const handScale = isMobile && boardLength === 10 ? 0.62 : (isMobile ? 0.72 : 1.0);

  return {
    GRID_BLOCK_SIZE: gridBlockSize,
    HAND_BLOCK_SIZE: 22 * scaleRatio * handScale,
    HITBOX_SIZE: Math.max(6, 12 * scaleRatio),
    DRAG_JUMP_LENGTH: 116 * scaleRatio
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

export function createSeededBoard(boardLength: number, seedNum: number): Board {
  const board = newEmptyBoard(boardLength);
  const prng = makeSeededPrng(seedNum);
  
  // Prefill with 10 to 15 blocks
  const numBlocks = prng.nextInt(10, 15);
  
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
  while (placed < numBlocks && attempts < 100) {
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
      let canFit = true;

      for (let pieceY = 0; pieceY < pieceHeight; pieceY++) {
        for (let pieceX = 0; pieceX < pieceWidth; pieceX++) {
          if (
            piece.matrix[pieceY][pieceX] === 1 &&
            board[boardY + pieceY][boardX + pieceX].blockType ===
              BoardBlockType.FILLED
          ) {
            canFit = false;
            break;
          }
        }
        if (!canFit) break;
      }

      if (canFit) {
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

    const possibleSpots = createPossibleBoardSpots(board, piece);
    for (let y = 0; y < possibleSpots.length; y++) {
      for (let x = 0; x < possibleSpots[y].length; x++) {
        if (possibleSpots[y][x] === 1) {
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

export function updateHoveredBreaks(
  board: Board,
  piece: PieceData,
  dropX: number,
  dropY: number,
) {
  "worklet";
  const boardLength = board.length;
  const tempBoard = [...board];
  placePieceOntoBoard(tempBoard, piece, dropX, dropY, BoardBlockType.HOVERED);

  const rowsToClear = new Set<number>();
  const colsToClear = new Set<number>();

  for (let row = 0; row < boardLength; row++) {
    if (
      tempBoard[row].every(
        (cell) =>
          cell.blockType === BoardBlockType.FILLED ||
          cell.blockType === BoardBlockType.HOVERED,
      )
    ) {
      rowsToClear.add(row);
    }
  }

  for (let col = 0; col < boardLength; col++) {
    if (
      tempBoard.every(
        (row) =>
          row[col].blockType === BoardBlockType.FILLED ||
          row[col].blockType === BoardBlockType.HOVERED,
      )
    ) {
      colsToClear.add(col);
    }
  }

  const count = rowsToClear.size + colsToClear.size;

  if (count > 0) {
    rowsToClear.forEach((row) => {
      for (let col = 0; col < boardLength; col++) {
        if (board[row][col].blockType === BoardBlockType.FILLED) {
          board[row][col].blockType = BoardBlockType.HOVERED_BREAK_FILLED;
          board[row][col].hoveredBreakColor = piece.color;
        } else {
          board[row][col].blockType = BoardBlockType.HOVERED_BREAK_EMPTY;
        }
      }
    });

    colsToClear.forEach((col) => {
      for (let row = 0; row < boardLength; row++) {
        if (board[row][col].blockType === BoardBlockType.FILLED) {
          board[row][col].blockType = BoardBlockType.HOVERED_BREAK_FILLED;
          board[row][col].hoveredBreakColor = piece.color;
        } else {
          board[row][col].blockType = BoardBlockType.HOVERED_BREAK_EMPTY;
        }
      }
    });
  }
}

export function breakLines(board: Board): number {
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

export function forEachBoardBlock(board: Board, each: ((block: BoardBlock, x: number, y: number) => boolean) | ((block: BoardBlock, x: number, y: number) => void)) {
  const length = board.length;
  for (let y = 0; y < length; y++) {
    for (let x = 0; x < length; x++) {
      each(board[y][x], x, y);
    }
  }
}
