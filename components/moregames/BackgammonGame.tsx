import { AdminWinButton } from "./AdminWinButton";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { submitMoreGameMatchResult } from "@/constants/Supabase";
import { Animated, PanResponder, View, Text, StyleSheet, useWindowDimensions } from "react-native";
import StylizedButton from "../StylizedButton";
import Collapsible from "../Collapsible";
import { recordMoreGameWin } from "@/constants/Achievements";
import { recordGameOutcome } from "@/constants/GameStats";
import { chooseBackgammonTurn } from "@/constants/bots/BackgammonBot";
import {
	absIndex, applyTurn, BackgammonState, BgMove, gameResult, initialState, isCompleteTurn, isMoveList, isValidState, legalNextMoves,
	other, pipCount, positionAfter, remainingDice, rollDice, Side, withDice,
} from "@/constants/backgammon/Rules";
import { BotPanel, useBotSettings } from "./BotPanel";
import { HintButton } from "./HintButton";
import { OnlineRole } from "./types";
import { OnlineRoomControls, isDuelRole, normalizeStoredPlayerName, roleLabel, useMiniGameRoom } from "./shared";
import { styles } from "./styles";
import { BACKGAMMON_SKINS, type ExtraGameCosmetics } from "./cosmetics";
import { useIncomingGameInvite } from "@/constants/GameInvite";
import { buzz, useGameSfx, useOutcomeSound } from "./feedback";
import { boardMetrics, moverRelOf, pointAt, pointRect, slotPosition, trayTarget, viewRelOf } from "./backgammon/layout";
import { PixelPoint } from "./backgammon/PixelPoint";
import { Dice } from "./backgammon/Dice";
import { Checker, SlideChecker, Tray } from "./backgammon/Parts";

// The host (player1) plays white; against the computer the player is white. Both sides' roll-off decides who starts.
const sideOfRole = (role: OnlineRole | null): Side => (role === "player2" ? "b" : "w");

/** The dice tumble this long. */
const ROLL_MS = 520;
/** A checker slides this long from point to point. */
const MOVE_MS = 240;
/** Pause after the last die is played (the player can still undo), and after a roll with nothing to play. */
const TURN_END_MS = 700;
const NO_MOVE_MS = 1500;

const isDicePair = (value: unknown): value is [number, number] =>
	Array.isArray(value) && value.length === 2 && value.every((die) => Number.isInteger(die) && die >= 1 && die <= 6);

/** A checker being shown on its way: the move, and the side that made it. */
interface Slide {
	id: number;
	move: BgMove;
	mover: Side;
}

export function BackgammonGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const skin = BACKGAMMON_SKINS[cosmetics.backgammonSkin] ?? BACKGAMMON_SKINS.classic;
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { width, height } = useWindowDimensions();
	// the board also shrinks to the height that is left after the status, trays, dice and buttons (the window of the
	// game is 80% of the screen on a desktop), so the roll and undo buttons stay in view without scrolling
	const m = useMemo(() => {
		const windowH = width < 600 ? height : height * 0.8;
		// header, status, trays, pips, dice row, mode switch and room panel take about this much on a phone
		const maxBoardH = Math.max(200, windowH - (width < 600 ? 555 : 440));
		const maxDiameter = (maxBoardH - 6) / 11.7;
		const widthByHeight = Math.floor((maxDiameter + 3) * 12.5 + 6);
		return boardMetrics(Math.min(480, widthByHeight, Math.max(260, width - 28)));
	}, [width, height]);

	const [state, setState] = useState<BackgammonState>(() => initialState());
	// the moves already made in the turn being played, not yet handed over
	const [played, setPlayed] = useState<BgMove[]>([]);
	// the point the player picked up (on the mover's own route) and the one being dragged
	const [selected, setSelected] = useState<number | null>(null);
	const [dragRel, setDragRel] = useState<number | null>(null);
	const [rolling, setRolling] = useState(false);
	const [replaying, setReplaying] = useState(false);
	const [slide, setSlide] = useState<Slide | null>(null);
	const [opponentReady, setOpponentReady] = useState(false);
	const [opponentName, setOpponentName] = useState("Opponent");
	const [remoteResult, setRemoteResult] = useState<string | null>(null);
	const [hint, setHint] = useState<BgMove | null>(null);
	const ratingSubmittedRef = useRef<string | null>(null);
	const { difficulty, setDifficulty, vsBot, setVsBot } = useBotSettings("backgammon");
	const sfx = useGameSfx();

	const stateRef = useRef(state);
	stateRef.current = state;
	const playedRef = useRef(played);
	playedRef.current = played;

	// ---- timers: the roll, the replay of a turn made by the computer or the opponent --------------------------------
	const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
	const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const later = useCallback((fn: () => void, ms: number) => {
		const id = setTimeout(() => {
			timers.current.delete(id);
			fn();
		}, ms);
		timers.current.add(id);
	}, []);
	const clearTimers = useCallback(() => {
		timers.current.forEach((id) => clearTimeout(id));
		timers.current.clear();
		if (rollTimer.current) clearTimeout(rollTimer.current);
	}, []);
	const cancelReplay = useCallback(() => {
		clearTimers();
		setReplaying(false);
		setRolling(false);
		setSlide(null);
	}, [clearTimers]);
	useEffect(() => clearTimers, [clearTimers]);

	const slideId = useRef(0);
	const startSlide = useCallback((move: BgMove, mover: Side) => setSlide({ id: ++slideId.current, move, mover }), []);
	const startRolling = useCallback(() => {
		setRolling(true);
		if (rollTimer.current) clearTimeout(rollTimer.current);
		rollTimer.current = setTimeout(() => setRolling(false), ROLL_MS);
		sfx("cardPlay");
	}, [sfx]);

	/** Shows `moves` one by one on the board, then hands the turn over with `finish`. */
	const runReplay = useCallback((base: BackgammonState, moves: BgMove[], finish: () => void) => {
		setReplaying(true);
		const gap = MOVE_MS + 120;
		moves.forEach((move, index) => later(() => {
			setPlayed((current) => [...current, move]);
			startSlide(move, base.turn);
			sfx("chessMove");
			if (move.to === 0) buzz("light");
		}, 250 + index * gap));
		later(() => {
			finish();
			setReplaying(false);
		}, 250 + moves.length * gap + 80);
	}, [later, sfx, startSlide]);

	/** Takes a position that came from the other side as it is. */
	const adopt = useCallback((next: BackgammonState) => {
		cancelReplay();
		setState(next);
		setPlayed([]);
		setSelected(null);
		setHint(null);
	}, [cancelReplay]);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			// the host brings the newcomer up to date (or starts a fresh game after a finished one)
			if (roomRef.current.role === "player1") {
				const finished = Boolean(gameResult(stateRef.current));
				const next = finished ? initialState() : stateRef.current;
				if (finished) {
					adopt(next);
					setRemoteResult(null);
					ratingSubmittedRef.current = null;
				}
				roomRef.current.send("sync", { state: next });
			}
			return;
		}
		if (event === "system_left" && senderRole && roomRef.current.role) {
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			setRemoteResult(t("moregames.leftYouWin", { name: roleLabel(senderRole) }));
			return;
		}
		if (event === "sync" && isValidState(payload?.state)) {
			adopt(payload.state);
			setOpponentReady(true);
			setRemoteResult(null);
			return;
		}
		if (event === "roll" && senderRole) {
			const current = stateRef.current;
			// only the side to move rolls, once
			if (current.turn === sideOfRole(senderRole) && !current.dice && !gameResult(current) && isDicePair(payload?.dice)) {
				setState(withDice(current, payload.dice));
				startRolling();
			}
			return;
		}
		if (event === "turn" && senderRole) {
			const current = stateRef.current;
			if (current.turn !== sideOfRole(senderRole)) {
				// not the turn we expected: take their position when it is a sound one
				if (isValidState(payload?.state)) adopt(payload.state);
				return;
			}
			const rolled = current.dice ? current : isDicePair(payload?.dice) ? withDice(current, payload.dice) : null;
			if (rolled && isMoveList(payload?.moves) && isCompleteTurn(rolled, payload.moves)) {
				const moves: BgMove[] = payload.moves;
				if (!current.dice) setState(rolled);
				setOpponentReady(true);
				setRemoteResult(null);
				runReplay(rolled, moves, () => {
					setState(applyTurn(rolled, moves));
					setPlayed([]);
				});
			} else if (isValidState(payload?.state)) {
				adopt(payload.state);
			}
		}
	}, [adopt, runReplay, startRolling, t]);

	const room = useMiniGameRoom("backgammon", handleEvent, playerName);
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

	const reset = () => {
		const next = initialState();
		adopt(next);
		setRemoteResult(null);
		ratingSubmittedRef.current = null;
		room.send("sync", { state: next });
	};

	// an accepted invitation from a friend: join their room right away
	useIncomingGameInvite("backgammon", (code) => { setVsBot(false); reset(); setOpponentReady(false); room.setRoomCode(code); room.connect("player2", code); });

	// ---- who is who -----------------------------------------------------------------------------------------------
	const result = useMemo(() => gameResult(state), [state]);
	const gameFinished = Boolean(result) || Boolean(remoteResult);
	const online = room.isConnected && isDuelRole(room.role);
	const botActive = vsBot && !room.role;
	const mySide: Side = online ? sideOfRole(room.role) : "w";
	// the board is drawn from the player's own seat; two people on one phone share white's view
	const viewSide = mySide;
	const connectionOk = !room.role || room.isConnected;
	/** The turn belongs to a person at this device (not the computer, not the opponent online). */
	const humanTurn = !gameFinished && connectionOk && (online ? state.turn === mySide && opponentReady : botActive ? state.turn === "w" : true);
	const busy = rolling || replaying;
	const canAct = humanTurn && Boolean(state.dice) && !busy;
	const canRoll = humanTurn && !state.dice && !busy;

	const nextMoves = useMemo(() => (humanTurn && state.dice ? legalNextMoves(state, played) : []), [humanTurn, state, played]);
	const shown = useMemo(() => positionAfter(state, played), [state, played]);
	const remaining = useMemo(() => (state.dice ? remainingDice(state.dice, played) : []), [state.dice, played]);
	const noMoves = humanTurn && Boolean(state.dice) && !busy && played.length === 0 && nextMoves.length === 0;

	const fromSet = useMemo(() => new Set(nextMoves.map((move) => move.from)), [nextMoves]);
	const targetMoves = useMemo(() => (selected !== null ? nextMoves.filter((move) => move.from === selected) : []), [nextMoves, selected]);
	const targetSet = useMemo(() => new Set(targetMoves.map((move) => move.to)), [targetMoves]);

	// ---- rolling and playing --------------------------------------------------------------------------------------
	const rollNow = useCallback(() => {
		const current = stateRef.current;
		if (current.dice || gameResult(current)) return;
		const dice = rollDice();
		setState(withDice(current, dice));
		startRolling();
		roomRef.current.send("roll", { dice });
	}, [startRolling]);

	const playMove = (move: BgMove, withSlide: boolean) => {
		setPlayed((current) => [...current, move]);
		setSelected(null);
		setHint(null);
		if (withSlide) startSlide(move, state.turn);
		sfx("chessMove");
		if (move.to === 0) buzz("light");
	};
	const pickMove = (from: number, to: number): BgMove | undefined =>
		nextMoves.filter((move) => move.from === from && move.to === to).sort((a, b) => a.die - b.die)[0];

	const undo = () => {
		setPlayed((current) => current.slice(0, -1));
		setSelected(null);
		setSlide(null);
		setHint(null);
	};

	/** Hands the finished turn over: to the opponent online, to the next side otherwise. */
	const commitTurn = useCallback(() => {
		const current = stateRef.current;
		const moves = playedRef.current;
		if (!current.dice || gameResult(current) || !isCompleteTurn(current, moves)) return;
		const next = applyTurn(current, moves);
		setState(next);
		setPlayed([]);
		setSelected(null);
		setHint(null);
		roomRef.current.send("turn", { moves, dice: current.dice, state: next });
	}, []);

	// The turn ends by itself when no die can be played any more (a moment after the last move, so it can be undone).
	useEffect(() => {
		if (!humanTurn || !state.dice || busy || nextMoves.length > 0) return;
		const timer = setTimeout(commitTurn, played.length > 0 ? TURN_END_MS : NO_MOVE_MS);
		return () => clearTimeout(timer);
	}, [humanTurn, state.dice, busy, nextMoves.length, played.length, commitTurn]);

	// The computer plays black: it rolls, thinks a moment and then moves like anyone else.
	useEffect(() => {
		if (!botActive || state.turn !== "b" || result || replaying || rolling) return;
		if (!state.dice) {
			const timer = setTimeout(rollNow, 600);
			return () => clearTimeout(timer);
		}
		if (played.length > 0) return;
		const timer = setTimeout(() => {
			const current = stateRef.current;
			if (!current.dice) return;
			const moves = chooseBackgammonTurn(current, difficulty);
			runReplay(current, moves, () => {
				setState(applyTurn(current, moves));
				setPlayed([]);
			});
		}, 450);
		return () => clearTimeout(timer);
	}, [botActive, state, played.length, result, replaying, rolling, difficulty, rollNow, runReplay]);

	// ---- touch: tap a checker, then where it goes; or drag it ---------------------------------------------------------
	const dragPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
	const gesture = useRef<{ x: number; y: number; candidate: number | null; wasSelected: boolean; dragging: boolean } | null>(null);
	const toMoverRel = (viewRel: number) => moverRelOf(viewSide, state.turn, viewRel);
	/** The move a release at (x, y) asks for, from the picked-up point: a point of the board or the edge tray. */
	const dropTarget = (from: number, x: number, y: number): BgMove | undefined => {
		const bottomTray = state.turn === viewSide;
		if ((bottomTray && y > m.innerH) || (!bottomTray && y < 0)) return pickMove(from, 0);
		const viewRel = pointAt(m, x, y);
		return viewRel === null ? undefined : pickMove(from, toMoverRel(viewRel));
	};

	const touchDown = (x: number, y: number) => {
		gesture.current = null;
		if (!canAct) return;
		const viewRel = pointAt(m, x, y);
		const rel = viewRel === null ? null : toMoverRel(viewRel);
		const candidate = rel !== null && fromSet.has(rel) && !(selected !== null && targetSet.has(rel)) ? rel : null;
		gesture.current = { x, y, candidate, wasSelected: candidate !== null && candidate === selected, dragging: false };
		if (candidate !== null && candidate !== selected) {
			setSelected(candidate);
			sfx("chessSelect");
		}
	};
	const touchMove = (dx: number, dy: number) => {
		const g = gesture.current;
		if (!g || g.candidate === null) return;
		if (!g.dragging && Math.hypot(dx, dy) > 8) {
			g.dragging = true;
			setDragRel(g.candidate);
		}
		if (g.dragging) dragPosition.setValue({ x: g.x + dx, y: g.y + dy });
	};
	const touchUp = (dx: number, dy: number) => {
		const g = gesture.current;
		gesture.current = null;
		setDragRel(null);
		// the system took the touch away (NaN): nothing was meant
		if (!g || Number.isNaN(dx)) return;
		if (g.dragging && g.candidate !== null) {
			const move = dropTarget(g.candidate, g.x + dx, g.y + dy);
			if (move) playMove(move, false);
			return;
		}
		const viewRel = pointAt(m, g.x, g.y);
		const rel = viewRel === null ? null : toMoverRel(viewRel);
		if (rel !== null && selected !== null && targetSet.has(rel)) {
			const move = pickMove(selected, rel);
			if (move) playMove(move, true);
		} else if (g.candidate !== null) {
			// a second tap on the picked-up checker puts it down again
			if (g.wasSelected) setSelected(null);
		} else {
			setSelected(null);
		}
	};
	const touchHandlers = useRef({ down: touchDown, move: touchMove, up: touchUp });
	touchHandlers.current = { down: touchDown, move: touchMove, up: touchUp };
	const pan = useRef(PanResponder.create({
		onStartShouldSetPanResponder: () => true,
		onMoveShouldSetPanResponder: () => true,
		onPanResponderTerminationRequest: () => false,
		onPanResponderGrant: (event) => touchHandlers.current.down(event.nativeEvent.locationX, event.nativeEvent.locationY),
		onPanResponderMove: (_event, g) => touchHandlers.current.move(g.dx, g.dy),
		onPanResponderRelease: (_event, g) => touchHandlers.current.up(g.dx, g.dy),
		onPanResponderTerminate: () => touchHandlers.current.up(Number.NaN, Number.NaN),
	})).current;

	const bearOff = () => {
		if (selected === null) return;
		const move = pickMove(selected, 0);
		if (move) playMove(move, true);
	};

	const showHint = () => {
		const turn = chooseBackgammonTurn(state, "hard", Math.random, { budgetMs: 300 });
		if (turn[0]) setHint(turn[0]);
	};

	// ---- results ----------------------------------------------------------------------------------------------------
	// Count the outcome for achievements once per finished game.
	const outcomeRecordedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!online && !botActive) return;
		const iWon = Boolean(remoteResult) || result?.winner === mySide;
		const iLost = !remoteResult && Boolean(result) && result?.winner !== mySide;
		if (!iWon && !iLost) {
			outcomeRecordedRef.current = null;
			return;
		}
		const key = `${room.roomCode}:${state.points.join(",")}:${state.off.w}:${state.off.b}:${remoteResult ?? ""}`;
		if (outcomeRecordedRef.current === key) return;
		outcomeRecordedRef.current = key;
		if (iWon) recordMoreGameWin("backgammon", { vsBot: botActive, difficulty });
		else recordGameOutcome("backgammon", "loss", { vsBot: botActive });
	}, [botActive, difficulty, mySide, online, remoteResult, result, room.roomCode, state.points, state.off]);

	useEffect(() => {
		if (!online) return;
		if (!result && !remoteResult) return;
		const matchResult: "player1" | "player2" = remoteResult ? (room.role as "player1" | "player2") : result!.winner === "w" ? "player1" : "player2";
		// one report per game: the turn count tells two games of the same room apart
		const resultKey = `${room.roomCode}:${matchResult}:${state.turns}:${remoteResult || result?.winner}`;
		if (ratingSubmittedRef.current === resultKey) return;
		// Every player reports the game; the server changes ratings on the loser's report. There are no draws.
		ratingSubmittedRef.current = resultKey;
		void submitMoreGameMatchResult({
			gameId: "backgammon",
			player1Name: room.role === "player1" ? playerName : opponentName,
			player2Name: room.role === "player2" ? playerName : opponentName,
			result: matchResult,
			roomCode: room.roomCode,
			metadata: { mars: Boolean(result?.mars), points: result?.points ?? 1 },
		}).then(() => onRatingChange());
	}, [onRatingChange, online, opponentName, playerName, remoteResult, result, room.role, room.roomCode, state.turns]);

	const outcome = remoteResult ? "win" : result ? ((online || botActive) && result.winner !== mySide ? "loss" : "win") : null;
	useOutcomeSound(outcome, `${room.roomCode}:${state.off.w}:${state.off.b}`);

	// ---- the texts --------------------------------------------------------------------------------------------------
	const youMode = online || botActive;
	const status = remoteResult
		|| (result ? (youMode ? t(result.winner === mySide ? "backgammon.youWin" : "backgammon.youLose") : t(result.winner === "w" ? "backgammon.whiteWins" : "backgammon.blackWins"))
			: room.role && !opponentReady ? t("moregames.waitingOpponent")
				: botActive && state.turn === "b" ? t("bot.thinking")
					: youMode ? t(state.turn === mySide ? (state.dice ? "backgammon.yourTurn" : "backgammon.yourRoll") : (state.dice ? "backgammon.theirTurn" : "backgammon.theirRoll"))
						: t(state.turn === "w" ? "backgammon.turnWhite" : "backgammon.turnBlack"));
	const subLine = result
		? t(result.mars ? "backgammon.mars" : "backgammon.onePoint")
		: noMoves ? t("backgammon.noMoves")
			: state.opening && !state.dice
				? (youMode
					? t("backgammon.opening", { a: state.opening[mySide === "w" ? 0 : 1], b: state.opening[mySide === "w" ? 1 : 0] })
					: t("backgammon.openingWb", { a: state.opening[0], b: state.opening[1] }))
				: "";
	const youPips = pipCount(shown, viewSide);
	const themPips = pipCount(shown, other(viewSide));
	const pipsLine = youMode
		? t("backgammon.pips", { you: youPips, them: themPips })
		: t("backgammon.pipsWb", { w: pipCount(shown, "w"), b: pipCount(shown, "b") });

	if (room.role && !opponentReady) {
		return (
			<View style={[styles.onlineGame, { minHeight: 400, justifyContent: "center" }]}>
				<OnlineRoomControls inviteGame="backgammon" inviteHostName={playerName}
					roomCode={room.roomCode}
					setRoomCode={room.setRoomCode}
					role={room.role}
					status={room.status}
					opponentReady={opponentReady}
					onHost={() => { setVsBot(false); reset(); setOpponentReady(false); room.connect("player1"); }}
					onJoin={() => { setVsBot(false); reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
					onDisconnect={room.disconnect}
				/>
			</View>
		);
	}

	// ---- the board ----------------------------------------------------------------------------------------------------
	const viewOfMover = (mover: Side, rel: number) => viewRelOf(viewSide, mover, rel);
	const slideTo = slide && slide.move.to > 0 ? viewOfMover(slide.mover, slide.move.to) : null;
	const draggedFrom = dragRel !== null ? viewOfMover(state.turn, dragRel) : null;
	const selectedView = selected !== null ? viewOfMover(state.turn, selected) : null;
	const targetViews = new Set(targetMoves.filter((move) => move.to > 0).map((move) => viewOfMover(state.turn, move.to)));
	const hintViews = new Set(hint ? [viewOfMover(state.turn, hint.from), ...(hint.to > 0 ? [viewOfMover(state.turn, hint.to)] : [])] : []);
	const movableViews = new Set(canAct && selected === null ? nextMoves.map((move) => viewOfMover(state.turn, move.from)) : []);

	const stacks = Array.from({ length: 24 }, (_, index) => {
		const viewRel = index + 1;
		const value = shown.points[absIndex(viewSide, viewRel)];
		return { viewRel, count: Math.abs(value), side: (value > 0 ? "w" : "b") as Side };
	});
	const countOf = (viewRel: number) => stacks[viewRel - 1].count;
	const bottomSide = viewSide;
	const topSide = other(viewSide);
	const slideOff = slide && slide.move.to === 0 ? slide.mover : null;
	const offOf = (side: Side) => shown.off[side] - (slideOff === side ? 1 : 0);
	const moverBottom = state.turn === viewSide;
	const bearOffActive = canAct && targetSet.has(0);

	let slideNode = null;
	if (slide) {
		const fromView = viewOfMover(slide.mover, slide.move.from);
		const nFrom = countOf(fromView);
		const start = slotPosition(m, fromView, nFrom, nFrom + 1);
		const end = slideTo !== null
			? slotPosition(m, slideTo, countOf(slideTo) - 1, countOf(slideTo))
			: trayTarget(m, slide.mover === viewSide, Math.max(0, shown.off[slide.mover] - 1));
		slideNode = (
			<SlideChecker
				key={slide.id}
				side={slide.mover}
				d={m.d}
				skin={skin}
				from={start}
				to={end}
				ms={MOVE_MS}
				onDone={() => setSlide((current) => (current && current.id === slide.id ? null : current))}
			/>
		);
	}

	return (
		<View style={styles.onlineGame}>
			<Text style={[styles.gameStatus, { color: gameFinished ? currentTheme.accent : currentTheme.textPrimary }]}>{status}</Text>
			{/* always takes its line, so the board does not jump when it shows */}
			<Text style={[local.subLine, { color: result ? currentTheme.accent : noMoves ? "#F87171" : currentTheme.textSecondary }]} numberOfLines={2}>{subLine || " "}</Text>

			<Tray
				testID="backgammon-tray-top"
				side={topSide}
				count={offOf(topSide)}
				skin={skin}
				width={m.outerW}
				active={bearOffActive && !moverBottom}
				label={t("backgammon.bearOff")}
				countLabel={t("backgammon.borneOff", { n: offOf(topSide) })}
				onPress={bearOff}
			/>
			<View testID="backgammon-board" style={[local.board, { width: m.outerW, height: m.outerH, borderWidth: m.frame, borderColor: skin.frame, backgroundColor: skin.field }]}>
				{/* the bar between the halves */}
				<View pointerEvents="none" style={{ position: "absolute", left: 6 * m.col, top: 0, width: m.bar, height: m.innerH, backgroundColor: skin.frame }} />
				{stacks.map(({ viewRel }) => {
					const rect = pointRect(m, viewRel);
					const lit = viewRel === selectedView ? "rgba(250,204,21,0.30)" : targetViews.has(viewRel) ? "rgba(74,222,128,0.34)" : hintViews.has(viewRel) ? "rgba(63,143,79,0.55)" : null;
					return (
						<View key={viewRel} testID={`backgammon-point-${viewRel}`} pointerEvents="none" style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
							<PixelPoint width={rect.w} height={rect.h} color={viewRel % 2 === 0 ? skin.pointA : skin.pointB} down={rect.top} />
							{lit ? <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: lit, borderWidth: targetViews.has(viewRel) ? 2 : 0, borderColor: "#4ADE80" }} /> : null}
						</View>
					);
				})}
				{stacks.map(({ viewRel, count, side }) => {
					if (count === 0) return null;
					const hidden = (slideTo === viewRel ? 1 : 0) + (draggedFrom === viewRel ? 1 : 0);
					const visible = count - hidden;
					return Array.from({ length: visible }, (_, slot) => {
						const at = slotPosition(m, viewRel, slot, count);
						const top = slot === visible - 1;
						const rim = top && viewRel === selectedView ? "#FACC15" : top && movableViews.has(viewRel) ? "#4ADE80" : undefined;
						return (
							<View key={`${viewRel}-${slot}`} pointerEvents="none" style={{ position: "absolute", left: at.x, top: at.y }}>
								<Checker side={side} d={m.d} skin={skin} rim={rim} rimWidth={rim ? 3 : 2} />
							</View>
						);
					});
				})}
				{slideNode}
				{dragRel !== null ? (
					<Animated.View pointerEvents="none" style={{ position: "absolute", left: -m.d / 2, top: -m.d / 2, zIndex: 10, transform: dragPosition.getTranslateTransform() }}>
						<Checker side={state.turn} d={m.d} skin={skin} rim="#FACC15" rimWidth={3} />
					</Animated.View>
				) : null}
				{/* one surface takes every touch; the board works out which point was meant */}
				<View testID="backgammon-touch" style={local.touch} {...pan.panHandlers} />
			</View>
			<Tray
				testID="backgammon-tray-bottom"
				side={bottomSide}
				count={offOf(bottomSide)}
				skin={skin}
				width={m.outerW}
				active={bearOffActive && moverBottom}
				label={t("backgammon.bearOff")}
				countLabel={t("backgammon.borneOff", { n: offOf(bottomSide) })}
				onPress={bearOff}
			/>

			<Text style={[local.pips, { color: currentTheme.textSecondary }]} numberOfLines={1}>{pipsLine}</Text>

			<View style={local.diceRow}>
				<Dice dice={state.dice} rolling={rolling} remaining={remaining} size={Math.max(36, Math.min(52, Math.round(m.col * 1.3)))} rollMs={ROLL_MS} />
				<View style={{ gap: 6 }}>
					<StylizedButton text={t("backgammon.roll")} onClick={rollNow} disabled={!canRoll} backgroundColor="#16A34A" style={[styles.resetButton, local.actionButton]} textStyle={styles.smallButtonText} />
					<View style={{ flexDirection: "row", gap: 6 }}>
						<StylizedButton text={t("backgammon.undo")} onClick={undo} disabled={!canAct || played.length === 0} backgroundColor={currentTheme.buttonSecondary} style={[styles.resetButton, local.halfButton]} textStyle={styles.smallButtonText} />
						<StylizedButton text={gameFinished ? t(room.role ? "moregames.rematch" : "bot.newGame") : t("moregames.reset")} onClick={reset} backgroundColor={gameFinished ? "#16A34A" : currentTheme.buttonPrimary} style={[styles.resetButton, local.halfButton]} textStyle={styles.smallButtonText} />
					</View>
				</View>
			</View>

			<View style={{ flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
				{!room.role && botActive && <HintButton disabled={gameFinished || !canAct || played.length > 0} onHint={showHint} />}
				{/* the player's checkers all come off, so white (the player) wins */}
				{!room.role && botActive && !gameFinished && (
					<AdminWinButton onWin={() => { cancelReplay(); setPlayed([]); setState((current) => ({ ...current, dice: null, points: current.points.map((n) => (n > 0 ? 0 : n)), off: { ...current.off, w: 15 } })); }} />
				)}
			</View>
			{!room.role && (
				<BotPanel compact vsBot={vsBot} onVsBotChange={(next) => { setVsBot(next); reset(); }} difficulty={difficulty} onDifficultyChange={(next) => { setDifficulty(next); reset(); }} />
			)}
			<View style={{ alignItems: "center", width: "100%" }}>
				<Collapsible visible={!vsBot || Boolean(room.role)}>
					<OnlineRoomControls inviteGame="backgammon" inviteHostName={playerName}
						roomCode={room.roomCode}
						setRoomCode={room.setRoomCode}
						role={room.role}
						status={room.status}
						opponentReady={opponentReady}
						onHost={() => { setVsBot(false); reset(); setOpponentReady(false); room.connect("player1"); }}
						onJoin={() => { setVsBot(false); reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
						onDisconnect={room.disconnect}
					/>
				</Collapsible>
			</View>
		</View>
	);
}

const local = StyleSheet.create({
	board: { borderRadius: 4 },
	touch: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 20 },
	subLine: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center", marginTop: -6, minHeight: 14 },
	pips: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center" },
	diceRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, minHeight: 60 },
	actionButton: { minWidth: 0, width: 214, margin: 0, height: 40, minHeight: 40 },
	halfButton: { minWidth: 0, width: 104, margin: 0, height: 40, minHeight: 40 },
});
