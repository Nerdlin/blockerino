import { absIndex } from "../../../constants/backgammon/Rules";
import { boardMetrics, columnOf, moverRelOf, pointAt, pointRect, slotPosition, stackStep, trayTarget, viewRelOf } from "./layout";

describe("backgammon board layout", () => {
	const m = boardMetrics(340);

	it("fits twelve points, the bar and the frame into the width", () => {
		expect(m.outerW).toBeLessThanOrEqual(340);
		expect(m.innerW).toBe(m.col * 12 + m.bar);
		expect(m.innerH).toBe(m.pointH * 2 + m.gap);
		expect(m.d).toBeLessThan(m.col);
		for (const width of [240, 300, 400, 480, 640]) expect(boardMetrics(width).outerW).toBeLessThanOrEqual(width);
	});

	it("puts the viewer's head top right and its home bottom right", () => {
		const head = pointRect(m, 24);
		expect(head.top).toBe(true);
		expect(head.x).toBe(m.innerW - m.col);
		const lastHome = pointRect(m, 1);
		expect(lastHome.top).toBe(false);
		expect(lastHome.x).toBe(m.innerW - m.col);
		// the route goes left along the top, drops at the corner and goes right along the bottom
		expect(pointRect(m, 13).x).toBe(0);
		expect(pointRect(m, 12).x).toBe(0);
		expect(pointRect(m, 12).y).toBeGreaterThan(pointRect(m, 13).y);
		expect(columnOf(24)).toBe(11);
		expect(columnOf(1)).toBe(11);
	});

	it("finds the point under a touch, and nothing on the bar or outside", () => {
		for (let rel = 1; rel <= 24; rel += 1) {
			const rect = pointRect(m, rel);
			expect(pointAt(m, rect.x + rect.w / 2, rect.top ? 2 : m.innerH - 2)).toBe(rel);
			expect(pointAt(m, rect.x + 1, rect.top ? rect.h - 2 : m.innerH - rect.h + 2)).toBe(rel);
		}
		expect(pointAt(m, 6 * m.col + m.bar / 2, 10)).toBeNull();
		expect(pointAt(m, -1, 10)).toBeNull();
		expect(pointAt(m, 10, -1)).toBeNull();
		expect(pointAt(m, m.innerW, 10)).toBeNull();
		expect(pointAt(m, 10, m.innerH)).toBeNull();
	});

	it("converts points between the viewer's route and the mover's", () => {
		for (const viewer of ["w", "b"] as const) {
			for (const mover of ["w", "b"] as const) {
				for (let rel = 1; rel <= 24; rel += 1) {
					expect(moverRelOf(viewer, mover, viewRelOf(viewer, mover, rel))).toBe(rel);
				}
			}
			// a side seen from its own seat is the identity
			expect(viewRelOf(viewer, viewer, 17)).toBe(17);
		}
		// white's head is black's point 12; black's head is white's point 12
		expect(viewRelOf("b", "w", 24)).toBe(12);
		expect(viewRelOf("w", "b", 24)).toBe(12);
		// the same physical point is the same array index
		expect(absIndex("w", 5)).toBe(absIndex("b", viewRelOf("b", "w", 5)));
	});

	it("stacks checkers edge to centre, touching until the row is full and then overlapping", () => {
		expect(stackStep(m, 1)).toBe(m.d);
		expect(stackStep(m, 5)).toBe(m.d);
		expect(stackStep(m, 15)).toBeLessThan(m.d);
		expect(stackStep(m, 15) * 14 + m.d).toBeLessThanOrEqual(m.pointH + 0.001);
		const top = slotPosition(m, 20, 2, 5);
		expect(top.y).toBe(2 * m.d);
		const bottom = slotPosition(m, 5, 0, 3);
		expect(bottom.y).toBe(m.innerH - m.d);
		const bottomThird = slotPosition(m, 5, 2, 3);
		expect(bottomThird.y).toBe(m.innerH - m.d - 2 * m.d);
		// centred in the point
		expect(top.x).toBe(pointRect(m, 20).x + (m.col - m.d) / 2);
	});

	it("puts the borne-off target outside the board, at the viewer's edge", () => {
		expect(trayTarget(m, true, 0).y).toBeGreaterThan(m.innerH);
		expect(trayTarget(m, false, 0).y).toBeLessThan(0);
		expect(trayTarget(m, true, 14).x).toBeGreaterThan(trayTarget(m, true, 0).x);
	});
});
