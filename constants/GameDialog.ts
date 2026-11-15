import { useSyncExternalStore } from "react";

// In-game message windows instead of the system Alert: the system one looks like the phone, not the game, shows
// nothing at all on the web, and on some phones came without a button to close it. gameAlert takes the same
// arguments as Alert.alert; the windows queue up and GameDialogHost (mounted once at the root) shows them one by one.

export interface GameDialogButton {
	text?: string;
	style?: "default" | "cancel" | "destructive";
	onPress?: () => void;
}

export interface GameDialogRequest {
	id: number;
	title: string;
	message?: string;
	/** Empty: a single OK button. */
	buttons: GameDialogButton[];
	/** false: the back button does not close it (a mandatory update). */
	cancelable: boolean;
}

let queue: GameDialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
	listeners.forEach((listener) => listener());
}

export function gameAlert(title: string, message?: string, buttons?: GameDialogButton[], options?: { cancelable?: boolean }): void {
	queue = [...queue, { id: nextId++, title, message, buttons: buttons ?? [], cancelable: options?.cancelable !== false }];
	emit();
}

/** Closes the window on screen; the button's own action runs after it closed. */
export function closeGameDialog(id: number, button?: GameDialogButton): void {
	queue = queue.filter((request) => request.id !== id);
	emit();
	button?.onPress?.();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** The window to show now, if any. */
export function useGameDialog(): GameDialogRequest | null {
	return useSyncExternalStore(subscribe, () => queue[0] ?? null, () => null);
}
