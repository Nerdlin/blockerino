import { useEffect, useRef, type MutableRefObject } from "react";
import { Platform } from "react-native";

type EscapeHandler = () => void;

interface EscapeHandlerEntry {
	handlerRef: MutableRefObject<EscapeHandler>;
	enabledRef: MutableRefObject<boolean>;
}

const escapeHandlers: EscapeHandlerEntry[] = [];
let isListening = false;

function isEditableTarget(target: EventTarget | null): boolean {
	if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
		return false;
	}

	const tagName = target.tagName.toLowerCase();
	return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function handleEscapeKey(event: KeyboardEvent) {
	if (event.key !== "Escape" || event.repeat) {
		return;
	}

	if (isEditableTarget(event.target)) {
		(event.target as HTMLElement).blur();
	}

	for (let i = escapeHandlers.length - 1; i >= 0; i--) {
		const entry = escapeHandlers[i];
		if (!entry.enabledRef.current) {
			continue;
		}

		event.preventDefault();
		event.stopPropagation();
		entry.handlerRef.current();
		return;
	}
}

function ensureEscapeListener() {
	if (Platform.OS !== "web" || typeof window === "undefined" || isListening) {
		return;
	}

	window.addEventListener("keydown", handleEscapeKey, true);
	isListening = true;
}

export function useEscapeKey(handler: EscapeHandler, enabled: boolean = true) {
	const handlerRef = useRef(handler);
	const enabledRef = useRef(enabled);

	handlerRef.current = handler;
	enabledRef.current = enabled;

	useEffect(() => {
		if (Platform.OS !== "web" || typeof window === "undefined") {
			return;
		}

		ensureEscapeListener();
		const entry = { handlerRef, enabledRef };
		escapeHandlers.push(entry);

		return () => {
			const index = escapeHandlers.indexOf(entry);
			if (index >= 0) {
				escapeHandlers.splice(index, 1);
			}
		};
	}, []);
}
