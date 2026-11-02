import { useEffect, useRef } from "react";
import { buzz, useGameSfx } from "./feedback";

// Sea Battle sounds and vibration, derived from how the boards changed so they play the same against the computer
// and online: a cannon shot, then a splash for a miss, an explosion for a hit or a bigger one with the hull going
// down for a sunk ship. Hits on the player's own fleet shake the phone harder.

type Shots = Record<string, "pending" | "hit" | "miss">;

interface ShotCounts {
	hit: number;
	miss: number;
	pending: number;
}

export function countShots(shots: Shots): ShotCounts {
	const counts: ShotCounts = { hit: 0, miss: 0, pending: 0 };
	for (const value of Object.values(shots)) counts[value] += 1;
	return counts;
}

/** What a new result on a board was: a sunk ship beats a hit, a hit beats a miss. */
export function shotOutcome(before: ShotCounts, after: ShotCounts, sunkBefore: number, sunkAfter: number): "sunk" | "hit" | "miss" | null {
	if (after.hit + after.miss <= before.hit + before.miss) return null;
	if (sunkAfter > sunkBefore) return "sunk";
	return after.hit > before.hit ? "hit" : "miss";
}

/** The cannon is heard first, the result this much later. */
const SHOT_FLIGHT_MS = 260;

export function useBattleFeedback({ targetShots, incomingShots, targetSunk, ownSunk }: { targetShots: Shots; incomingShots: Shots; targetSunk: number; ownSunk: number }): void {
	const play = useGameSfx();
	const previous = useRef({ target: countShots(targetShots), incoming: countShots(incomingShots), targetSunk, ownSunk });
	const awaitingResult = useRef(false);
	const mounted = useRef(true);
	useEffect(() => () => {
		mounted.current = false;
	}, []);

	useEffect(() => {
		const now = { target: countShots(targetShots), incoming: countShots(incomingShots), targetSunk, ownSunk };
		const before = previous.current;
		previous.current = now;
		// a new game cleared the boards
		if (now.target.hit + now.target.miss < before.target.hit + before.target.miss || now.incoming.hit + now.incoming.miss < before.incoming.hit + before.incoming.miss) {
			awaitingResult.current = false;
			return;
		}
		const later = (ms: number, run: () => void) => setTimeout(() => {
			if (mounted.current) run();
		}, ms);

		// online the shot waits for the opponent's answer: the cannon fires right away
		if (now.target.pending > before.target.pending) {
			play("shotFire");
			awaitingResult.current = true;
		}
		const ours = shotOutcome(before.target, now.target, before.targetSunk, now.targetSunk);
		if (ours) {
			const fired = awaitingResult.current;
			awaitingResult.current = false;
			if (!fired) play("shotFire");
			later(fired ? 0 : SHOT_FLIGHT_MS, () => {
				play(ours === "sunk" ? "shipSunk" : ours === "hit" ? "shotHit" : "shotSplash");
				if (ours === "sunk") buzz("success");
				else if (ours === "hit") buzz("medium");
			});
		}
		const theirs = shotOutcome(before.incoming, now.incoming, before.ownSunk, now.ownSunk);
		if (theirs) {
			play("shotFire");
			later(SHOT_FLIGHT_MS, () => {
				play(theirs === "sunk" ? "shipSunk" : theirs === "hit" ? "shotHit" : "shotSplash");
				if (theirs === "sunk") {
					buzz("heavy");
					later(140, () => buzz("heavy"));
				} else if (theirs === "hit") {
					buzz("heavy");
				}
			});
		}
	}, [targetShots, incomingShots, targetSunk, ownSunk, play]);
}
