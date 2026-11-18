import { absIndex, relOf, Side } from "../../../constants/backgammon/Rules";

// Where things stand on the backgammon board. The board is always drawn from the viewer's own route: the viewer's
// point 24 (its head) is the top right corner, the points 13..24 run along the top from left to right, and 12..1 run
// along the bottom from left to right, so the viewer's home (1..6) is the bottom right. A point is named by its number
// on the viewer's route ("view point"); a move names points on the route of the side that moves ("mover point").

export interface BoardMetrics {
	/** Width of one point. */
	col: number;
	/** Width of the bar between the two halves. */
	bar: number;
	/** Frame thickness. */
	frame: number;
	/** Checker diameter. */
	d: number;
	/** Height of one row of points. */
	pointH: number;
	/** Gap between the two rows. */
	gap: number;
	innerW: number;
	innerH: number;
	outerW: number;
	outerH: number;
}

/** Whole-pixel sizes for a board that is at most `availableWidth` wide, frame included. */
export function boardMetrics(availableWidth: number, frame = 3): BoardMetrics {
	const col = Math.max(18, Math.floor((availableWidth - frame * 2) / 12.5));
	const bar = Math.max(4, Math.round(col * 0.5));
	const d = col - 3;
	const pointH = Math.round(d * 5.6);
	const gap = Math.max(4, Math.round(d * 0.5));
	const innerW = col * 12 + bar;
	const innerH = pointH * 2 + gap;
	return { col, bar, frame, d, pointH, gap, innerW, innerH, outerW: innerW + frame * 2, outerH: innerH + frame * 2 };
}

/** The viewer's point (1..24) that is `moverRel` on the route of `mover`. */
export function viewRelOf(viewer: Side, mover: Side, moverRel: number): number {
	return relOf(viewer, absIndex(mover, moverRel));
}

/** The mover's point (1..24) that the viewer sees as `viewRel`. */
export function moverRelOf(viewer: Side, mover: Side, viewRel: number): number {
	return relOf(mover, absIndex(viewer, viewRel));
}

export const isTopPoint = (viewRel: number) => viewRel >= 13;
export const columnOf = (viewRel: number) => (viewRel >= 13 ? viewRel - 13 : 12 - viewRel);
export const columnX = (m: BoardMetrics, column: number) => column * m.col + (column >= 6 ? m.bar : 0);

export interface PointRect {
	x: number;
	y: number;
	w: number;
	h: number;
	top: boolean;
}

export function pointRect(m: BoardMetrics, viewRel: number): PointRect {
	const top = isTopPoint(viewRel);
	return { x: columnX(m, columnOf(viewRel)), y: top ? 0 : m.pointH + m.gap, w: m.col, h: m.pointH, top };
}

/** The view point under (x, y), measured from the inside corner of the frame; null on the bar, the gap or outside. */
export function pointAt(m: BoardMetrics, x: number, y: number): number | null {
	if (x < 0 || y < 0 || x >= m.innerW || y >= m.innerH) return null;
	let column = -1;
	for (let c = 0; c < 12; c += 1) {
		const left = columnX(m, c);
		if (x >= left && x < left + m.col) {
			column = c;
			break;
		}
	}
	if (column < 0) return null;
	return y < m.pointH + m.gap / 2 ? 13 + column : 12 - column;
}

/** Distance between neighbouring checkers of a stack of `count`: touching when they fit, overlapping when not. */
export function stackStep(m: BoardMetrics, count: number): number {
	if (count <= 1) return m.d;
	return Math.min(m.d, (m.pointH - m.d) / (count - 1));
}

/** Top-left corner of the checker box in slot `index` (0 is the one on the edge) of a stack of `count`. */
export function slotPosition(m: BoardMetrics, viewRel: number, index: number, count: number): { x: number; y: number } {
	const rect = pointRect(m, viewRel);
	const step = stackStep(m, count);
	const x = rect.x + (m.col - m.d) / 2;
	return { x, y: rect.top ? index * step : m.innerH - m.d - index * step };
}

/** Where a borne-off checker of the tray at the bottom (or top) edge goes: just outside the frame, over its slot. */
export function trayTarget(m: BoardMetrics, bottom: boolean, slot: number): { x: number; y: number } {
	const slotWidth = m.innerW / 15;
	return { x: slot * slotWidth + (slotWidth - m.d) / 2, y: bottom ? m.innerH + m.frame + 4 : -m.d - m.frame - 4 };
}
