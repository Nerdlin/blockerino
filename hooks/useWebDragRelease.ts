import { useEffect } from "react";
import { Platform } from "react-native";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import type { XYPoint } from "@/constants/Board";

export function useWebDragRelease(draggingPiece: SharedValue<number | null>) {
	const lastUpdate = useSharedValue<XYPoint | null>(null);
	const releasedAt = useSharedValue<XYPoint | null>(null);

	useEffect(() => {
		if (Platform.OS !== "web" || typeof window === "undefined") return;
		const captureRelease = (event: PointerEvent) => {
			if (event.pointerType === "mouse" && draggingPiece.value !== null) {
				releasedAt.value = { x: event.clientX, y: event.clientY };
			}
		};
		window.addEventListener("pointerup", captureRelease, true);
		return () => window.removeEventListener("pointerup", captureRelease, true);
	}, [draggingPiece, releasedAt]);

	return { lastUpdate, releasedAt };
}

/** The web pan handler can miss a mouse move across its boundary, leaving the previous drop target active. */
export function movedBeyondDropTarget(lastUpdate: XYPoint | null, releasedAt: XYPoint | null, maxOverlap: number): boolean {
	"worklet";
	return lastUpdate !== null && releasedAt !== null
		&& (Math.abs(lastUpdate.x - releasedAt.x) >= maxOverlap || Math.abs(lastUpdate.y - releasedAt.y) >= maxOverlap);
}
