import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Text, View } from "react-native";
import StylizedButton from "../../StylizedButton";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { recordMoreGameWin } from "@/constants/Achievements";
import { recordGameOutcome } from "@/constants/GameStats";
import { Color } from "@/constants/chess/ChessClock";
import {
	ChessGameState,
	abandon,
	abort,
	answerDraw,
	newGame,
	offerDraw,
	playMove,
	resign,
	settleAutoAbort,
	settleTimeout,
} from "@/constants/chess/ChessGameState";
import { buildPgn, resultFromWinner } from "@/constants/chess/ChessPgn";
import { ReportOutcome, reportChessMatch } from "@/constants/chess/ChessRatingsApi";
import { TimeControl, formatTimeControl, parseTimeControl } from "@/constants/chess/TimeControls";
import { normalizeStoredPlayerName, OnlineRoomControls, roleLabel, useMiniGameRoom } from "../shared";
import { OnlineRole } from "../types";
import { ExtraGameCosmetics } from "../cosmetics";
import { ChessGameView } from "./ChessGameView";
import { useChessSounds } from "./useChessSounds";
import { ResultLayer } from "./ChessScreens";

/** Ticks while a clock runs, so the clocks on screen move; idle otherwise. */
function useNow(active: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 100);
		return () => clearInterval(timer);
	}, [active]);
	return active ? now : Date.now();
}

/**
 * A game against a friend in a room (code). The host (player1) picks the time control and starts every game; the
 * guest follows. Moves, resignations and draw offers travel as room events; each side keeps its own clock and settles
 * flags and the auto-abort itself. A finished game is reported to the server for the rating of its time class.
 */
export function RoomGame({
	control,
	playerName,
	cosmetics,
	autoMatch,
	onRatingsChanged,
	onExit,
}: {
	control: TimeControl;
	playerName: string;
	cosmetics: ExtraGameCosmetics;
	/** A game the server paired: the room code and color are given, nobody types a code. White hosts, Black joins. */
	autoMatch?: { code: string; color: Color; opponent: string; waitMs?: number; challenge?: boolean };
	onRatingsChanged: () => void;
	onExit: () => void;
}) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const [state, setStateRaw] = useState<ChessGameState | null>(null);
	const stateRef = useRef<ChessGameState | null>(null);
	const [gameNo, setGameNo] = useState(0);
	const [whiteRole, setWhiteRole] = useState<"player1" | "player2">("player1");
	const [activeControl, setActiveControl] = useState<TimeControl>(control);
	const [opponentReady, setOpponentReady] = useState(false);
	const [opponentName, setOpponentName] = useState(autoMatch?.opponent ?? "Opponent");
	const [rematch, setRematch] = useState({ me: false, them: false });
	const [report, setReport] = useState<ReportOutcome | null>(null);
	const [copied, setCopied] = useState(false);
	const reportedRef = useRef<string | null>(null);
	const gameNoRef = useRef(0);
	const opponentReadyRef = useRef(false);
	useEffect(() => { gameNoRef.current = gameNo; }, [gameNo]);
	useEffect(() => { opponentReadyRef.current = opponentReady; }, [opponentReady]);

	const setState = useCallback((next: ChessGameState | null) => {
		stateRef.current = next;
		setStateRaw(next);
	}, []);

	const roomRef = useRef<{ role: OnlineRole | null; send: (event: string, payload?: any) => void }>({ role: null, send: () => {} });
	const startGame = useCallback((control: TimeControl, white: "player1" | "player2", number: number) => {
		setActiveControl(control);
		setWhiteRole(white);
		setGameNo(number);
		setReport(null);
		setRematch({ me: false, them: false });
		reportedRef.current = null;
		setState(newGame(control, Date.now()));
	}, [setState]);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		const room = roomRef.current;
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			// the host starts the first game as soon as the guest is in
			if (room.role === "player1") {
				startGame(control, "player1", 1);
				room.send("start", { control: control.id, white: "player1", number: 1, name: playerName });
			}
			return;
		}
		if (event === "system_left" && senderRole && room.role) {
			const current = stateRef.current;
			setOpponentReady(false);
			if (current && !current.result) {
				const leaverColor: Color = (senderRole === "player1") === (whiteRoleRef.current === "player1") ? "w" : "b";
				setState(abandon(current, leaverColor));
			}
			return;
		}
		if (event === "hello" && room.role === "player1") {
			setOpponentReady(true);
			const current = stateRef.current;
			if (current) room.send("start", { control: activeControlRef.current.id, white: whiteRoleRef.current, number: gameNoRef.current, name: playerName });
			else {
				startGame(control, "player1", 1);
				room.send("start", { control: control.id, white: "player1", number: 1, name: playerName });
			}
			return;
		}
		if (event === "start") {
			const parsed = parseTimeControl(payload?.control);
			if (!parsed) return;
			// the host was in the room before the guest came, so the guest never saw its join: a start is proof it is there
			setOpponentReady(true);
			if (typeof payload?.name === "string" && payload.name.trim()) setOpponentName(normalizeStoredPlayerName(payload.name));
			const number = Number(payload?.number) || 1;
			// the host repeats its start for a guest that asked twice: the same game is not started again
			if (stateRef.current && number === gameNoRef.current) return;
			startGame(parsed, payload?.white === "player2" ? "player2" : "player1", Number(payload?.number) || 1);
			return;
		}
		const current = stateRef.current;
		if (!current || current.result) {
			if (event === "rematch") setRematch((value) => ({ ...value, them: true }));
			return;
		}
		if (event === "move" && payload?.from && payload?.to) {
			const outcome = playMove(current, { from: payload.from, to: payload.to, promotion: payload.promotion }, Date.now());
			if (outcome.ok) setState(outcome.state);
		} else if (event === "resign" && senderRole) {
			const sender: Color = (senderRole === "player1") === (whiteRoleRef.current === "player1") ? "w" : "b";
			setState(resign(current, sender));
		} else if (event === "drawOffer" && senderRole) {
			const sender: Color = (senderRole === "player1") === (whiteRoleRef.current === "player1") ? "w" : "b";
			setState(offerDraw(current, sender));
		} else if (event === "drawAnswer") {
			setState(answerDraw(current, Boolean(payload?.accept)));
		} else if (event === "abort") {
			setState(abort(current));
		}
	}, [control, setState, startGame]);

	const room = useMiniGameRoom("chess", handleEvent, playerName);
	const whiteRoleRef = useRef(whiteRole);
	useEffect(() => { whiteRoleRef.current = whiteRole; }, [whiteRole]);
	const activeControlRef = useRef(activeControl);
	useEffect(() => { activeControlRef.current = activeControl; }, [activeControl]);

	// A paired game connects by itself: White hosts at once, Black joins a moment later and keeps saying hello until
	// the host answers; nobody showing up within half a minute ends the attempt.
	const connectRef = useRef(room.connect);
	useEffect(() => { connectRef.current = room.connect; }, [room.connect]);
	const autoCode = autoMatch?.code;
	const autoWaitMs = autoMatch?.waitMs ?? 30000;
	const autoColor = autoMatch?.color;
	useEffect(() => {
		if (!autoCode || !autoColor) return;
		const timers: ReturnType<typeof setTimeout>[] = [];
		let hello: ReturnType<typeof setInterval> | null = null;
		if (autoColor === "w") connectRef.current("player1", autoCode);
		else {
			timers.push(setTimeout(() => {
				connectRef.current("player2", autoCode);
				hello = setInterval(() => {
					if (stateRef.current) return;
					roomRef.current.send("hello", {});
				}, 1500);
			}, 1200));
		}
		timers.push(setTimeout(() => {
			if (opponentReadyRef.current) return;
			roomRef.current.send("leave", {});
			onExitRef.current();
		}, autoWaitMs));
		return () => {
			timers.forEach(clearTimeout);
			if (hello) clearInterval(hello);
		};
	}, [autoCode, autoColor]);
	const onExitRef = useRef(onExit);
	useEffect(() => { onExitRef.current = onExit; }, [onExit]);
	useEffect(() => { roomRef.current = { role: room.role, send: room.send }; }, [room.role, room.send]);

	const myColor: Color = room.role === whiteRole ? "w" : "b";
	const clockRunning = Boolean(state?.clock && !state.result);
	const now = useNow(clockRunning);
	useChessSounds(state, myColor, now);

	// Flags and the auto-abort are settled on both sides by the same rule.
	useEffect(() => {
		if (!state || state.result) return;
		const settled = settleAutoAbort(settleTimeout(state, now), now);
		if (settled !== state) setState(settled);
	}, [now, state, setState]);

	// Rematch: both sides asked, the host starts the next game with the colors swapped.
	useEffect(() => {
		if (!rematch.me || !rematch.them || room.role !== "player1") return;
		const next = whiteRole === "player1" ? "player2" : "player1";
		startGame(activeControl, next, gameNo + 1);
		room.send("start", { control: activeControl.id, white: next, number: gameNo + 1, name: playerName });
	}, [rematch, room, whiteRole, activeControl, gameNo, startGame]);

	// Achievements and the rating report happen once per finished game.
	const savedRef = useRef<string | null>(null);
	useEffect(() => {
		const result = state?.result;
		if (!state || !result || !room.roomCode) return;
		const key = `${room.roomCode}-${gameNo}`;
		if (savedRef.current !== key && result.winner !== null) {
			savedRef.current = key;
			if (result.winner === myColor) recordMoreGameWin("chess", { vsBot: false });
			else recordGameOutcome("chess", result.winner === "draw" ? "draw" : "loss", { vsBot: false });
		}
		if (reportedRef.current === key || result.winner === null) return;
		reportedRef.current = key;
		void reportChessMatch({
			roomCode: key,
			timeClass: activeControl.timeClass,
			myColor,
			opponentName,
			result: resultFromWinner(result.winner),
			plies: state.history.length,
		}).then((outcome) => {
			setReport(outcome);
			if (outcome.status === "applied") onRatingsChanged();
		});
	}, [state, room.roomCode, gameNo, myColor, activeControl.timeClass, opponentName, onRatingsChanged]);

	const pgn = useMemo(() => {
		if (!state) return "";
		const mine = playerName;
		return buildPgn({
			history: state.history,
			white: myColor === "w" ? mine : opponentName,
			black: myColor === "w" ? opponentName : mine,
			result: resultFromWinner(state.result?.winner ?? null),
			timeControl: activeControl.id,
			termination: state.result?.reason,
			event: "Blockerino friend game",
		});
	}, [state, myColor, playerName, opponentName, activeControl.id]);
	const copyPgn = () => {
		Clipboard.setString(pgn);
		setCopied(true);
		setTimeout(() => setCopied(false), 1800);
	};

	const leave = () => {
		if (state && !state.result) setState(resign(state, myColor));
		room.send("leave", {});
		room.disconnect();
		onExit();
	};

	if (autoMatch && (!room.role || !opponentReady || !state)) {
		return (
			<View style={{ width: "100%", alignItems: "center", minHeight: 240, justifyContent: "center", gap: 12 }}>
				<Text style={{ fontFamily: "SilkscreenBold", fontSize: 13, color: currentTheme.textPrimary, textAlign: "center" }}>{autoMatch.challenge && !opponentReady ? t("chess.waitingFriend", { name: autoMatch.opponent }) : t("chess.matchFound", { name: autoMatch.opponent })}</Text>
				<Text style={{ fontFamily: "Silkscreen", fontSize: 10, color: currentTheme.textSecondary }}>{t("chess.connecting")}</Text>
				<StylizedButton text={t("chess.cancel")} onClick={() => { roomRef.current.send("leave", {}); room.disconnect(); onExit(); }} backgroundColor={currentTheme.buttonSecondary} style={{ minWidth: 110, height: 36, minHeight: 36, margin: 0 }} textStyle={{ fontSize: 11 }} />
			</View>
		);
	}

	if (!room.role || !opponentReady || !state) {
		return (
			<View style={{ width: "100%", alignItems: "center", minHeight: 320, justifyContent: "center" }}>
				<OnlineRoomControls
					roomCode={room.roomCode}
					setRoomCode={room.setRoomCode}
					role={room.role}
					status={room.status}
					opponentReady={opponentReady}
					onHost={() => { setOpponentReady(false); setState(null); room.connect("player1"); }}
					onJoin={() => { setOpponentReady(false); setState(null); room.connect("player2", room.roomCode); }}
					onDisconnect={() => { room.disconnect(); onExit(); }}
				/>
			</View>
		);
	}

	const act = {
		move: (from: string, to: string, promotion?: string) => {
			const outcome = playMove(state, { from, to, promotion }, Date.now());
			if (!outcome.ok) return;
			setState(outcome.state);
			room.send("move", { from, to, promotion });
		},
		resign: () => { setState(resign(state, myColor)); room.send("resign", {}); },
		abort: () => { setState(abort(state)); room.send("abort", {}); },
		offerDraw: () => { setState(offerDraw(state, myColor)); room.send("drawOffer", {}); },
		answerDraw: (accept: boolean) => { setState(answerDraw(state, accept)); room.send("drawAnswer", { accept }); },
	};

	const ratingLine =
		report?.status === "applied" && report.before !== undefined && report.after !== undefined
			? `${t(`chess.${activeControl.timeClass}`)}: ${report.after} (${report.after - report.before >= 0 ? "+" : ""}${report.after - report.before})`
			: state.result && state.result.winner !== null && report?.status === "pending"
				? `${t(`chess.${activeControl.timeClass}`)}: ...`
				: t("chess.unrated");

	return (
		<View style={{ width: "100%", alignItems: "center", position: "relative" }}>
			<ChessGameView
				state={state}
				myColor={myColor}
				me={{ name: playerName, color: currentTheme.accent }}
				opponent={{ name: opponentName, color: "#7B3FE4" }}
				cosmetics={cosmetics}
				now={now}
				statusText={copied ? t("chess.pgnCopied") : formatTimeControl(activeControl)}
				friendGame
				onMove={act.move}
				onResign={act.resign}
				onAbort={act.abort}
				onOfferDraw={act.offerDraw}
				onAnswerDraw={act.answerDraw}
				onCopyPgn={copyPgn}
				onNewGame={leave}
			/>
			{state.result ? (
				<ResultLayer
					top={112}
					result={state.result}
					myColor={myColor}
					opponentName={opponentName}
					ratingLine={ratingLine}
					onRematch={rematch.me ? undefined : () => { setRematch((value) => ({ ...value, me: true })); room.send("rematch", {}); }}
					onNewGame={leave}
					newGameLabel={t("chess.back")}
					onCopyPgn={copyPgn}
				/>
			) : null}
		</View>
	);
}
