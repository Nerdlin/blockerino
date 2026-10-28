import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { View } from "react-native";
import { ChessBotProfile } from "@/constants/chess/BotRoster";
import { Color } from "@/constants/chess/ChessClock";
import { ChessProgress, loadChessProgress, rememberTimeControl } from "@/constants/chess/ChessProgress";
import { ChessRatings, NO_RATINGS, fetchMyChessRatings } from "@/constants/chess/ChessRatingsApi";
import { START_RATING } from "@/constants/chess/ChessElo";
import { DEFAULT_TIME_CONTROL, TimeControl, parseTimeControl } from "@/constants/chess/TimeControls";
import { ExtraGameCosmetics } from "./cosmetics";
import { BotGame } from "./chess/BotGame";
import { RoomGame } from "./chess/RoomGame";
import { BotPicker, ChessLobby } from "./chess/ChessScreens";
import { ChessFriend, ChessFriends } from "./chess/ChessFriends";
import { ChessTimePicker } from "./chess/ChessTimePicker";
import { chessInviteAtom, makeInviteCode, sendChessInvite } from "@/constants/chess/ChessInvite";
import { useLanguage } from "@/constants/Localization";
import { Alert } from "react-native";
import { ChessSearch, FoundMatch } from "./chess/ChessSearch";
import { styles } from "./styles";

export { CHESS_FILES, CHESS_RANKS, UNICODE_PIECES, getChessBoardColors } from "./chess/ChessParts";

export function restoreChessGame(fen: string, history: string[]): Chess {
	const replay = new Chess();
	try {
		for (const move of history) replay.move(move);
		if (replay.fen() === fen) return replay;
	} catch {}
	return new Chess(fen);
}

type Screen = "lobby" | "time" | "friends" | "bots" | "bot" | "friend" | "search" | "match";

/**
 * Chess in More Games: a lobby with a rating per time class, bots with a fixed Elo, and games against a friend in a
 * room. The game logic lives in constants/chess; this component only moves between the screens.
 */
export function ChessOnlineGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const [screen, setScreen] = useState<Screen>("lobby");
	const [control, setControl] = useState<TimeControl>(DEFAULT_TIME_CONTROL);
	const [ratings, setRatings] = useState<ChessRatings>(NO_RATINGS);
	const [progress, setProgress] = useState<ChessProgress>({ beatenBots: [], form: [], lastTimeControl: null });
	const [pick, setPick] = useState<{ bot: ChessBotProfile; color: Color; beatenBefore: boolean } | null>(null);
	const [found, setFound] = useState<(FoundMatch & { waitMs?: number; challenge?: boolean }) | null>(null);
	const { t } = useLanguage();
	const [invite, setInvite] = useAtom(chessInviteAtom);

	// An accepted challenge from a friend: join their room as Black right away.
	useEffect(() => {
		if (!invite) return;
		setControl(invite.control);
		setFound({ code: invite.code, color: "b", opponent: invite.hostName, control: invite.control, waitMs: 30000 });
		setScreen("match");
		setInvite(null);
	}, [invite, setInvite]);

	// Challenges a friend: opens a room with a random code as White, sends the code and waits for the answer.
	const challenge = useCallback(async (friend: ChessFriend) => {
		const code = makeInviteCode();
		const sent = await sendChessInvite(friend.id, { code, hostName: playerName, control });
		if (!sent) {
			Alert.alert(t("chess.challengeFailed"));
			return;
		}
		setFound({ code, color: "w", opponent: friend.name, control, waitMs: 60000, challenge: true });
		setScreen("match");
	}, [control, playerName, t]);

	const refreshRatings = useCallback(() => {
		void fetchMyChessRatings().then(setRatings);
		onRatingChange();
	}, [onRatingChange]);
	const refreshProgress = useCallback(() => {
		void loadChessProgress().then(setProgress);
	}, []);

	useEffect(() => {
		let active = true;
		void fetchMyChessRatings().then((next) => active && setRatings(next));
		void loadChessProgress().then((next) => {
			if (!active) return;
			setProgress(next);
			const remembered = parseTimeControl(next.lastTimeControl);
			if (remembered) setControl(remembered);
		});
		return () => {
			active = false;
		};
	}, []);

	// Echo plays at the player's level: the best rating they have, or the starting one.
	const playerRating = useMemo(() => {
		const known = [ratings.bullet, ratings.blitz, ratings.rapid].filter((entry): entry is { rating: number; games: number } => entry !== null);
		return known.length ? Math.max(...known.map((entry) => entry.rating)) : START_RATING;
	}, [ratings]);

	return (
		<View style={[styles.onlineGame, { alignItems: "center" }]}>
			{screen === "lobby" && (
				<ChessLobby
					ratings={ratings}
					selected={control}
					onOpenTime={() => setScreen("time")}
					onStart={() => setScreen("search")}
					onPlayFriend={() => setScreen("friends")}
					onPlayBots={() => { refreshProgress(); setScreen("bots"); }}
				/>
			)}
			{screen === "time" && (
				<ChessTimePicker
					selected={control}
					onPick={(next) => { setControl(next); void rememberTimeControl(next.id); setScreen("lobby"); }}
					onBack={() => setScreen("lobby")}
				/>
			)}
			{screen === "friends" && (
				<ChessFriends
					control={control}
					onChallenge={(friend) => void challenge(friend)}
					onPlayWithCode={() => setScreen("friend")}
					onBack={() => setScreen("lobby")}
				/>
			)}
			{screen === "bots" && (
				<BotPicker
					progress={progress}
					playerRating={playerRating}
					onBack={() => setScreen("lobby")}
					onPick={(bot, choice) => {
						const color: Color = choice === "random" ? (Math.random() < 0.5 ? "w" : "b") : choice;
						setPick({ bot, color, beatenBefore: progress.beatenBots.includes(bot.id) });
						setScreen("bot");
					}}
				/>
			)}
			{screen === "bot" && pick && (
				<BotGame
					key={`${pick.bot.id}-${pick.bot.elo}-${pick.color}`}
					bot={pick.bot}
					color={pick.color}
					playerName={playerName}
					cosmetics={cosmetics}
					beatenBefore={pick.beatenBefore}
					onExit={() => { refreshProgress(); setScreen("bots"); }}
					onProgress={refreshProgress}
				/>
			)}
			{screen === "search" && (
				<ChessSearch
					control={control}
					onCancel={() => setScreen("lobby")}
					onMatched={(match) => { setFound(match); setScreen("match"); }}
				/>
			)}
			{screen === "match" && found && (
				<RoomGame
					key={found.code}
					control={found.control}
					playerName={playerName}
					cosmetics={cosmetics}
					autoMatch={{ code: found.code, color: found.color, opponent: found.opponent, waitMs: found.waitMs, challenge: found.challenge }}
					onRatingsChanged={refreshRatings}
					onExit={() => setScreen("lobby")}
				/>
			)}
			{screen === "friend" && (
				<RoomGame
					control={control}
					playerName={playerName}
					cosmetics={cosmetics}
					onRatingsChanged={refreshRatings}
					onExit={() => setScreen("lobby")}
				/>
			)}
		</View>
	);
}
