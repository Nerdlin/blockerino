import { MomentRecorder, type MomentLog } from "./MomentRecorder";

// The game being played keeps its recorder here, so the game-over window (a separate component) can offer the
// moment without the recorder being passed through every screen. One game is on screen at a time.

let active: MomentRecorder | null = null;

export function setActiveMomentRecorder(recorder: MomentRecorder | null): void {
	active = recorder;
}

/** Removes the recorder when its game goes away (a newer game may already have taken the slot). */
export function releaseMomentRecorder(recorder: MomentRecorder): void {
	if (active === recorder) active = null;
}

/** What has been recorded so far, or null when there is nothing worth sharing. */
export function getMomentSnapshot(): MomentLog | null {
	if (!active || active.size === 0) return null;
	return active.snapshot();
}
