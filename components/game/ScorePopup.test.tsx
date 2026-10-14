import { getEncouragingText, getEncouragingColor } from "./ScorePopup";

describe("ScorePopup text and styling", () => {
	it("returns encouraging text appropriately based on points", () => {
		expect(getEncouragingText(0)).toBe("");
		expect(getEncouragingText(20)).not.toBe("");
		expect(getEncouragingText(100)).not.toBe("");
		expect(getEncouragingText(550)).not.toBe("");
	});

	it("returns encouraging colors based on points thresholds", () => {
		expect(getEncouragingColor(10)).toBe("#32CD32");
		expect(getEncouragingColor(60)).toBe("#00FFFF");
		expect(getEncouragingColor(200)).toBe("#FF00FF");
		expect(getEncouragingColor(600)).toBe("#FF1493");
	});

	it("clamps coordinates within the board boundaries", () => {
		const gridWidth = 368;
		const totalHeight = 368;
		const gridBlockSize = 46;
		const popupWidth = Math.min(200, Math.max(140, gridWidth - 24));
		const HORIZONTAL_PADDING = 8;
		const minLeft = HORIZONTAL_PADDING;
		const maxLeft = Math.max(minLeft, gridWidth - popupWidth - HORIZONTAL_PADDING);

		// Test for rightmost column (col 7 on 8x8 grid)
		const col7X = 7 * gridBlockSize;
		const cellCenterX = col7X + gridBlockSize / 2;
		const idealLeft = cellCenterX - popupWidth / 2;
		const clampedLeft = Math.max(minLeft, Math.min(maxLeft, idealLeft));

		expect(clampedLeft).toBeLessThanOrEqual(maxLeft);
		expect(clampedLeft + popupWidth).toBeLessThanOrEqual(gridWidth - HORIZONTAL_PADDING);
		expect(clampedLeft).toBeGreaterThanOrEqual(minLeft);

		// Test for leftmost column (col 0)
		const col0X = 0;
		const cell0CenterX = col0X + gridBlockSize / 2;
		const ideal0Left = cell0CenterX - popupWidth / 2;
		const clamped0Left = Math.max(minLeft, Math.min(maxLeft, ideal0Left));

		expect(clamped0Left).toBe(minLeft);
		expect(clamped0Left + popupWidth).toBeLessThanOrEqual(gridWidth);

		// Test for vertical clamping on top row (row 0)
		const FLOAT_UP = 36;
		const VERTICAL_PADDING = 10;
		const minTop = FLOAT_UP + VERTICAL_PADDING;
		const popupHeight = 55;
		const maxTop = Math.max(minTop, totalHeight - popupHeight - VERTICAL_PADDING);
		const cellCenterY = 0 + gridBlockSize / 2;
		const idealTop = cellCenterY - popupHeight / 2;
		const clampedTop = Math.max(minTop, Math.min(maxTop, idealTop));

		expect(clampedTop).toBe(minTop);
		// When floated up, top position remains inside the board
		expect(clampedTop - FLOAT_UP).toBeGreaterThanOrEqual(VERTICAL_PADDING);
	});
});
