import { closeGameDialog, gameAlert, type GameDialogRequest } from "./GameDialog";

// the store is module state; read it through a fake subscription by peeking with useGameDialog's snapshot
import * as GameDialog from "./GameDialog";

function current(): GameDialogRequest | null {
	let value: GameDialogRequest | null = null;
	// useSyncExternalStore is a hook; the snapshot comes from the same queue, so render-free checks go through it
	const React = jest.requireActual("react");
	const spy = jest.spyOn(React, "useSyncExternalStore").mockImplementation(((_s: unknown, get: () => GameDialogRequest | null) => get()) as never);
	value = GameDialog.useGameDialog();
	spy.mockRestore();
	return value;
}

describe("game dialogs", () => {
	it("show one at a time, in order, and run the pressed button after closing", () => {
		const pressed = jest.fn();
		gameAlert("First", "one");
		gameAlert("Second", undefined, [{ text: "Go", onPress: pressed }], { cancelable: false });
		const first = current()!;
		expect(first.title).toBe("First");
		expect(first.cancelable).toBe(true);
		closeGameDialog(first.id);
		const second = current()!;
		expect(second.title).toBe("Second");
		expect(second.cancelable).toBe(false);
		closeGameDialog(second.id, second.buttons[0]);
		expect(pressed).toHaveBeenCalledTimes(1);
		expect(current()).toBeNull();
	});
});
