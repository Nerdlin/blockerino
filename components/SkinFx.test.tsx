import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { Board } from "@/constants/Board";
import { StaticBoardFx, SkinPreviewFx } from "./SkinFx";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const COLOR = { r: 200, g: 60, b: 60 };
function board(rows: string[]): Board {
	return rows.map((row) => [...row].map((ch) => ({ blockType: ch === "#" ? 4 : 0, color: COLOR, hoveredBreakColor: { r: 0, g: 0, b: 0 } })));
}

describe("skin animation layers", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("draws a shop preview for a skin and plays its loop without trouble", () => {
		let tree!: TestRenderer.ReactTestRenderer;
		act(() => {
			tree = TestRenderer.create(<SkinPreviewFx skinId="piece_chest_dragon" rows={2} cols={3} blockSize={32} pitch={37} />);
		});
		act(() => {
			jest.advanceTimersByTime(4000);
		});
		expect(tree.toJSON()).not.toBeNull();
		act(() => tree.unmount());
	});

	it("draws nothing for the plain classic block", () => {
		let tree!: TestRenderer.ReactTestRenderer;
		act(() => {
			tree = TestRenderer.create(<SkinPreviewFx skinId="piece_classic" rows={2} cols={3} blockSize={32} pitch={37} />);
		});
		expect(tree.toJSON()).toBeNull();
	});

	it("follows another player's board: a line that goes plays its effect", () => {
		const first = board(["........", "########", "........", "........", "........", "........", "........", "........"]);
		const second = board(["........", "........", "#.......", "........", "........", "........", "........", "........"]);
		let tree!: TestRenderer.ReactTestRenderer;
		act(() => {
			tree = TestRenderer.create(<StaticBoardFx board={first} skinId="piece_circuit_matrix" blockSize={20} />);
		});
		act(() => {
			tree.update(<StaticBoardFx board={second} skinId="piece_circuit_matrix" blockSize={20} />);
		});
		act(() => {
			jest.advanceTimersByTime(1000);
		});
		expect(tree.toJSON()).not.toBeNull();
		act(() => tree.unmount());
	});
});
