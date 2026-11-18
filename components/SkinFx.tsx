import React, { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import Animated, {
	Easing,
	SharedValue,
	cancelAnimation,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import type { Board } from "@/constants/Board";
import type { SkinAnim } from "@/constants/SkinAnimations";
import { getSkinAnim } from "@/constants/SkinAnimations";
import {
	beamStyle,
	diffBoards,
	idleCycle,
	idleSparkPart,
	particleBox,
	particleMotion,
	planEvents,
	trailParticle,
	type FxBeam,
	type FxFrame,
	type FxParticle,
} from "@/constants/SkinFxMath";
import { colorToHex } from "@/constants/Color";
import { getPieceSkinColor, pieceColors } from "@/constants/Piece";
import type { Hand } from "@/constants/Hand";

// Draws the skin animations (constants/SkinAnimations.ts, constants/SkinFxMath.ts). A layer owns a small pool of
// particle views, each driven by two shared values (its progress and what it is), so a burst costs a few writes and no
// React render: the board's own reaction (or, for a board that arrives as a prop, an effect) plans the particles and
// hands them to free views. Nothing here runs per frame except the animated styles of particles that are alive.

// On native, Reanimated runs each animated style once on the JS thread before the UI thread takes over; the board
// shared values are not worth a trip for that first run.
const SKIPS_JS_FIRST_RUN = Platform.OS !== "web";
function isJsFirstRun() {
	"worklet";
	return SKIPS_JS_FIRST_RUN && (globalThis as { __RUNTIME_KIND?: number }).__RUNTIME_KIND === 1;
}

const HIDDEN = { opacity: 0 };
const NO_BOX = { width: 0, height: 0 };
const POOL_BOARD = Platform.OS === "web" ? 72 : 56;
const POOL_SMALL = 24;
const POOL_TRAIL = 10;
const BEAMS = 3;

export type FxSlot = { p: SharedValue<number>; i: SharedValue<FxParticle | null> };
export type BeamSlot = { p: SharedValue<number>; i: SharedValue<FxBeam | null> };

/** The effects ease off when the system asks for reduced motion: fewer particles, no idle shimmer, no trail, no combo show. */
export function useReducedFx(): boolean {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		let alive = true;
		AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setReduced(value)).catch(() => undefined);
		const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => setReduced(value));
		return () => {
			alive = false;
			sub?.remove?.();
		};
	}, []);
	return reduced;
}

// A pool has a fixed size for as long as it lives, so the hooks run the same number of times on every render.
function useParticleSlots(size: number): FxSlot[] {
	const slots: FxSlot[] = [];
	for (let k = 0; k < size; k++) {
		// eslint-disable-next-line react-hooks/rules-of-hooks -- the size of a pool never changes
		slots.push({ p: useSharedValue(0), i: useSharedValue<FxParticle | null>(null) });
	}
	return slots;
}

function useBeamSlots(size: number): BeamSlot[] {
	const slots: BeamSlot[] = [];
	for (let k = 0; k < size; k++) {
		// eslint-disable-next-line react-hooks/rules-of-hooks -- the size of a pool never changes
		slots.push({ p: useSharedValue(0), i: useSharedValue<FxBeam | null>(null) });
	}
	return slots;
}

/** Hands particles to the next views of the pool; returns where the pool continues. */
export function pushParticles(slots: FxSlot[], cursor: number, list: FxParticle[]): number {
	"worklet";
	const n = slots.length;
	if (n === 0) return 0;
	let c = cursor;
	for (let k = 0; k < list.length; k++) {
		const q = list[k];
		const slot = slots[c % n];
		c++;
		slot.i.value = q;
		slot.p.value = 0;
		slot.p.value = withDelay(q.dl, withTiming(1, { duration: q.t, easing: Easing.linear }));
	}
	return c % n;
}

export function pushBeams(slots: BeamSlot[], cursor: number, list: FxBeam[]): number {
	"worklet";
	const n = slots.length;
	if (n === 0) return 0;
	let c = cursor;
	for (let k = 0; k < list.length; k++) {
		const q = list[k];
		const slot = slots[c % n];
		c++;
		slot.i.value = q;
		slot.p.value = 0;
		slot.p.value = withDelay(q.dl, withTiming(1, { duration: q.t, easing: Easing.linear }));
	}
	return c % n;
}

const FxParticleView = memo(function FxParticleView({ slot }: { slot: FxSlot }) {
	// size and colours only when the slot gets a new particle; opacity and transform every frame
	const box = useAnimatedStyle((): any => {
		if (isJsFirstRun()) return NO_BOX;
		const i = slot.i.value;
		return i === null ? NO_BOX : particleBox(i);
	});
	const motion = useAnimatedStyle((): any => {
		if (isJsFirstRun()) return HIDDEN;
		const i = slot.i.value;
		const p = slot.p.value;
		if (i === null || p <= 0 || p >= 1) return HIDDEN;
		const frame: FxFrame = { x: 0, y: 0, a: 1, sc: 1 };
		return particleMotion(i, p, frame);
	});
	return <Animated.View pointerEvents="none" style={[styles.part, box, motion]} />;
});

const FxBeamView = memo(function FxBeamView({ slot }: { slot: BeamSlot }) {
	const style = useAnimatedStyle((): any => {
		if (isJsFirstRun()) return HIDDEN;
		const i = slot.i.value;
		const p = slot.p.value;
		if (i === null || p <= 0 || p >= 1) return HIDDEN;
		return beamStyle(i, p);
	});
	return <Animated.View pointerEvents="none" style={[styles.part, style]} />;
});

/** One spark of the idle shimmer: now and then it lights a block of the board, in the skin's own way. */
const IdleSparkView = memo(function IdleSparkView({ board, clock, anim, k, blockSize, pitch, skinId }: { board: SharedValue<Board>; clock: SharedValue<number>; anim: SkinAnim; k: number; blockSize: number; pitch: number; skinId: string }) {
	const idle = anim.idle;
	// the spark's particle is worked out once per cycle (not every frame), the frames only move it
	const part = useSharedValue<FxParticle | null>(null);
	useAnimatedReaction(
		() => idleCycle(idle, k, clock.value).cyc,
		(cyc, prev) => {
			if (cyc === prev) return;
			part.value = idleSparkPart(idle, board.value, k, cyc, blockSize, pitch, skinId);
		},
		[idle, k, blockSize, pitch, skinId],
	);
	const box = useAnimatedStyle((): any => {
		if (isJsFirstRun()) return NO_BOX;
		const i = part.value;
		return i === null ? NO_BOX : particleBox(i);
	});
	const motion = useAnimatedStyle((): any => {
		if (isJsFirstRun()) return HIDDEN;
		const i = part.value;
		if (i === null) return HIDDEN;
		const { p } = idleCycle(idle, k, clock.value);
		if (p >= 1) return HIDDEN;
		const frame: FxFrame = { x: 0, y: 0, a: 1, sc: 1 };
		return particleMotion(i, p, frame);
	});
	return <Animated.View pointerEvents="none" style={[styles.part, box, motion]} />;
});

/** A clock for the idle shimmer: milliseconds since it started, counted by a timing that outlasts any game. */
function useIdleClock(enabled: boolean): SharedValue<number> {
	const clock = useSharedValue(0);
	useEffect(() => {
		if (!enabled) return;
		clock.value = withTiming(1e9, { duration: 1e9, easing: Easing.linear });
		return () => cancelAnimation(clock);
	}, [enabled, clock]);
	return clock;
}

/** How many views of a pool are mounted: a few more every frame, so a pool of dozens never lands in a single frame. */
function useMountedCount(total: number, perFrame = 8): number {
	const [count, setCount] = useState(Math.min(total, perFrame));
	useEffect(() => {
		if (count >= total) return;
		const id = requestAnimationFrame(() => setCount((c) => Math.min(total, c + perFrame)));
		return () => cancelAnimationFrame(id);
	}, [count, total, perFrame]);
	return count;
}

function Canvas({ slots, beams, idleNodes }: { slots: FxSlot[]; beams: BeamSlot[]; idleNodes?: React.ReactNode }) {
	const mounted = useMountedCount(slots.length);
	return (
		<View pointerEvents="none" style={styles.layer}>
			{beams.map((slot, index) => <FxBeamView key={`b${index}`} slot={slot} />)}
			{slots.slice(0, mounted).map((slot, index) => <FxParticleView key={`p${index}`} slot={slot} />)}
			{idleNodes}
		</View>
	);
}

type OwnProps = {
	board: SharedValue<Board>;
	combo?: SharedValue<number>;
	skinId: string;
	anim: SkinAnim;
	blockSize: number;
	reduced: boolean;
};

/**
 * The animation layer of the player's own board: it watches the board on the UI thread and turns blocks landing and
 * going, and lines being cleared, into the skin's particles and bars (and the combo effect of chest skins).
 */
const OwnBoardFxLayer = memo(function OwnBoardFxLayer({ board, combo, skinId, anim, blockSize, reduced }: OwnProps) {
	const slots = useParticleSlots(POOL_BOARD);
	const beams = useBeamSlots(BEAMS);
	const cursor = useSharedValue(0);
	const beamCursor = useSharedValue(0);
	const clock = useIdleClock(!reduced);
	const level = reduced ? 0.5 : 1;

	useAnimatedReaction(
		() => board.value,
		(cur, prev) => {
			if (!prev || cur === prev) return;
			const ev = diffBoards(prev, cur, true);
			if (ev.placed.length === 0 && ev.cleared.length === 0) return;
			const plan = planEvents(anim, ev, prev, cur, skinId, { B: blockSize, pitch: blockSize, seed: Math.floor(Math.random() * 2147483647), combo: combo ? combo.value : 0, level });
			cursor.value = pushParticles(slots, cursor.value, plan.ps);
			beamCursor.value = pushBeams(beams, beamCursor.value, plan.bs);
		},
		[anim, skinId, blockSize, level],
	);

	const sparks: React.ReactNode[] = [];
	if (!reduced) {
		for (let k = 0; k < anim.idle.k; k++) {
			sparks.push(<IdleSparkView key={`i${k}`} board={board} clock={clock} anim={anim} k={k} blockSize={blockSize} pitch={blockSize} skinId={skinId} />);
		}
	}
	return <Canvas slots={slots} beams={beams} idleNodes={sparks} />;
});

type StaticProps = {
	board: Board;
	skinId: string;
	blockSize: number;
	/** Cells (row * columns + column) of the piece another player is dragging over this board. */
	hoverCells?: number[];
	hoverHex?: string;
};

/** The same layer for a board that arrives as a prop (a Versus opponent's): it compares each new board with the last one. */
export const StaticBoardFx = memo(function StaticBoardFx({ board, skinId, blockSize, hoverCells, hoverHex }: StaticProps) {
	const anim = getSkinAnim(skinId);
	const reduced = useReducedFx();
	const slots = useParticleSlots(POOL_SMALL);
	const beams = useBeamSlots(2);
	const sv = useSharedValue<Board>(board);
	const cursor = useRef(0);
	const beamCursor = useRef(0);
	const previous = useRef<Board | null>(null);
	const clock = useIdleClock(!reduced && anim !== null);
	const level = reduced ? 0.5 : 1;

	useEffect(() => {
		sv.value = board;
		const prev = previous.current;
		previous.current = board;
		if (!prev || !anim || prev.length !== board.length) return;
		const ev = diffBoards(prev, board, false);
		if (ev.placed.length === 0 && ev.cleared.length === 0) return;
		const plan = planEvents(anim, ev, prev, board, skinId, { B: blockSize, pitch: blockSize, seed: Math.floor(Math.random() * 2147483647), combo: 0, level });
		cursor.current = pushParticles(slots, cursor.current, plan.ps.slice(0, POOL_SMALL));
		beamCursor.current = pushBeams(beams, beamCursor.current, plan.bs);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [board]);

	const hoverKey = hoverCells && hoverCells.length > 0 ? hoverCells.join(",") : "";
	useEffect(() => {
		if (!anim || reduced || !hoverCells || hoverCells.length === 0) return;
		const cols = board[0].length;
		const idx = hoverCells[Math.floor(Math.random() * hoverCells.length)];
		const cx = (idx % cols) * blockSize + blockSize / 2;
		const cy = Math.floor(idx / cols) * blockSize + blockSize / 2;
		const list: FxParticle[] = [];
		for (let k = 0; k < anim.trail.n; k++) list.push(trailParticle(anim, cx, cy, blockSize, hoverHex ?? "#ffffff", Math.floor(Math.random() * 2147483647)));
		cursor.current = pushParticles(slots, cursor.current, list);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hoverKey]);

	if (!anim) return null;
	const sparks: React.ReactNode[] = [];
	if (!reduced) {
		for (let k = 0; k < Math.min(2, anim.idle.k); k++) {
			sparks.push(<IdleSparkView key={`i${k}`} board={sv} clock={clock} anim={anim} k={k} blockSize={blockSize} pitch={blockSize} skinId={skinId} />);
		}
	}
	return <Canvas slots={slots} beams={beams} idleNodes={sparks} />;
});

type TrailProps = {
	anim: SkinAnim;
	skinId: string;
	hand: SharedValue<Hand>;
	index: number;
	offset: { x: { value: number }; y: { value: number } };
	state: { value: string };
	/** Side of the hand slot (px): the piece sits in its middle until it is dragged. */
	slotSize: number;
	/** How far above the finger a dragged piece floats (px). */
	jump: number;
	/** Size of a block of a dragged piece (px). */
	gridSize: number;
};

/** The trail of a dragged piece: every half block it moves, it leaves a few particles where it was. */
const SkinTrailLayer = memo(function SkinTrailLayer({ anim, skinId, hand, index, offset, state, slotSize, jump, gridSize }: TrailProps) {
	const slots = useParticleSlots(POOL_TRAIL);
	const mounted = useMountedCount(POOL_TRAIL, 4);
	const cursor = useSharedValue(0);
	const step = Math.max(8, gridSize * 0.5);
	useAnimatedReaction(
		() => (state.value === "dragging" ? Math.floor(offset.x.value / step) * 4096 + Math.floor(offset.y.value / step) : -1e9),
		(cur, prev) => {
			if (cur === -1e9 || cur === prev) return;
			const piece = hand.value[index];
			if (!piece) return;
			const rows = piece.matrix.length;
			const cols = piece.matrix[0].length;
			const filled: number[] = [];
			for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (piece.matrix[y][x] >= 1) filled.push(y * cols + x);
			if (filled.length === 0) return;
			const hex = colorToHex(getPieceSkinColor(piece.color, skinId));
			const cx0 = slotSize / 2 + offset.x.value - (cols * gridSize) / 2;
			const cy0 = slotSize / 2 + offset.y.value - jump - (rows * gridSize) / 2;
			const list: FxParticle[] = [];
			for (let k = 0; k < anim.trail.n; k++) {
				const cell = filled[Math.floor(Math.random() * filled.length)];
				const px = cx0 + ((cell % cols) + 0.5) * gridSize;
				const py = cy0 + (Math.floor(cell / cols) + 0.5) * gridSize;
				list.push(trailParticle(anim, px, py, gridSize, hex, Math.floor(Math.random() * 2147483647)));
			}
			cursor.value = pushParticles(slots, cursor.value, list);
		},
		[anim, skinId, slotSize, jump, gridSize],
	);
	return (
		<View pointerEvents="none" style={styles.trail}>
			{slots.slice(0, mounted).map((slot, k) => <FxParticleView key={`t${k}`} slot={slot} />)}
		</View>
	);
});

/** True a moment after mount: the effect pools (dozens of animated views) start after the board has drawn, so entering a game stays instant. */
function useMountedLate(ms: number): boolean {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		const id = setTimeout(() => setReady(true), ms);
		return () => clearTimeout(id);
	}, [ms]);
	return ready;
}

export const OwnBoardFx = memo(function OwnBoardFx(props: OwnProps) {
	return useMountedLate(350) ? <OwnBoardFxLayer {...props} /> : null;
});

export const SkinTrail = memo(function SkinTrail(props: TrailProps) {
	return useMountedLate(450) ? <SkinTrailLayer {...props} /> : null;
});

function previewBoard(rows: number, cols: number): Board {
	const out: Board = [];
	for (let y = 0; y < rows; y++) {
		const row = [];
		for (let x = 0; x < cols; x++) row.push({ blockType: 4, color: pieceColors[(y * cols + x) % pieceColors.length], hoveredBreakColor: { r: 0, g: 0, b: 0 } });
		out.push(row);
	}
	return out;
}

function hashOf(text: string): number {
	let h = 7;
	for (let k = 0; k < text.length; k++) h = (Math.imul(h, 31) + text.charCodeAt(k)) >>> 0;
	return h;
}

type PreviewProps = { skinId: string; rows: number; cols: number; blockSize: number; pitch: number; mini?: boolean };

/** What a skin looks like in motion, for the shop: every few seconds a piece is dragged, lands, and a line goes. */
export function SkinPreviewFx({ skinId, rows, cols, blockSize, pitch, mini = false }: PreviewProps) {
	const anim = getSkinAnim(skinId);
	const [ready, setReady] = useState(!mini);
	useEffect(() => {
		if (!mini) return;
		const timer = setTimeout(() => setReady(true), 200 + (hashOf(skinId) % 1200));
		return () => clearTimeout(timer);
	}, [mini, skinId]);
	if (!anim || !ready) return null;
	return <PreviewLoop anim={anim} skinId={skinId} rows={rows} cols={cols} blockSize={blockSize} pitch={pitch} mini={mini} />;
}

function PreviewLoop({ anim, skinId, rows, cols, blockSize, pitch, mini }: PreviewProps & { anim: SkinAnim }) {
	const slots = useParticleSlots(mini ? 10 : 44);
	const beams = useBeamSlots(mini ? 1 : 2);
	const board = useSharedValue<Board>(previewBoard(rows, cols));
	const clock = useIdleClock(!mini);
	const cursor = useRef(0);
	const beamCursor = useRef(0);

	useEffect(() => {
		const model = previewBoard(rows, cols);
		const timers: ReturnType<typeof setTimeout>[] = [];
		const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
		const emit = (events: { placed: number[]; cleared: number[]; lines: number[] }, combo: number) => {
			const plan = planEvents(anim, events, model, model, skinId, { B: blockSize, pitch, seed: Math.floor(Math.random() * 2147483647), combo, level: mini ? 0.5 : 1 });
			cursor.current = pushParticles(slots, cursor.current, plan.ps.slice(0, slots.length));
			beamCursor.current = pushBeams(beams, beamCursor.current, plan.bs);
		};
		const trailAt = (cx: number, cy: number) => {
			const list: FxParticle[] = [];
			for (let k = 0; k < anim.trail.n; k++) list.push(trailParticle(anim, cx, cy, blockSize, "#ffffff", Math.floor(Math.random() * 2147483647)));
			cursor.current = pushParticles(slots, cursor.current, list);
		};
		const run = () => {
			const row = Math.floor(Math.random() * rows);
			if (!mini) {
				for (let k = 0; k < 5; k++) at(k * 130, () => trailAt(((k + 0.5) / 5) * (cols * pitch), (row + 0.5) * pitch));
				at(700, () => emit({ placed: [row * cols + Math.floor(Math.random() * cols)], cleared: [], lines: [] }, 0));
				const cleared: number[] = [];
				for (let x = 0; x < cols; x++) cleared.push(row * cols + x);
				at(1400, () => emit({ placed: [], cleared, lines: [row] }, 4));
			} else {
				const cleared: number[] = [];
				for (let x = 0; x < cols; x++) cleared.push(row * cols + x);
				at(200, () => emit({ placed: [], cleared, lines: [row] }, 0));
			}
		};
		const first = setTimeout(run, mini ? hashOf(skinId) % 2000 : 300);
		const loop = setInterval(run, mini ? 3600 : 3400);
		return () => {
			clearTimeout(first);
			clearInterval(loop);
			timers.forEach(clearTimeout);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [anim, skinId, rows, cols, blockSize, pitch, mini]);

	const sparks: React.ReactNode[] = [];
	if (!mini) {
		for (let k = 0; k < 2; k++) sparks.push(<IdleSparkView key={`i${k}`} board={board} clock={clock} anim={anim} k={k} blockSize={blockSize} pitch={pitch} skinId={skinId} />);
	}
	return <Canvas slots={slots} beams={beams} idleNodes={sparks} />;
}

const styles = StyleSheet.create({
	layer: {
		position: "absolute",
		left: 0,
		top: 0,
		right: 0,
		bottom: 0,
		zIndex: 100,
		pointerEvents: "none",
	},
	trail: {
		position: "absolute",
		left: 0,
		top: 0,
		right: 0,
		bottom: 0,
		zIndex: 5,
		pointerEvents: "none",
	},
	part: {
		position: "absolute",
		left: 0,
		top: 0,
		width: 0,
		height: 0,
		opacity: 0,
	},
});
