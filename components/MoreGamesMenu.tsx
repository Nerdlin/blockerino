import { Platform, UIManager, useWindowDimensions, ScrollView, View, Text, TextInput } from "react-native";
import FadeInView from "./FadeInView";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useAppState, MenuStateType } from "@/hooks/useAppState";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { setProfileAuthIntent } from "@/constants/ProfileIntent";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useShopState } from "@/constants/Shop";
import { MoreGameRating, getMoreGameLeaderboard, MoreGameRatingGameId, getPlayerMoreGameRating } from "@/constants/Supabase";
import { track } from "@/constants/Analytics";
import { useAtomValue } from "jotai";
import { chessInviteAtom } from "@/constants/chess/ChessInvite";
import { gameInviteAtom } from "@/constants/GameInvite";
import { subscribeToOutcomes } from "@/constants/GameStats";
import { useSoundSettings } from "@/constants/Sound";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { cssColors } from "@/constants/Color";
import { MoreGameId, RatedMoreGameId } from "./moregames/types";
import { CARD_SKINS, CHESS_BOARD_COLORS, CHESS_PIECE_COLORS, ExtraGameCosmetics, MAHJONG_THEMES, SEA_SKINS, SUDOKU_THEMES, pickCosmetic } from "./moregames/cosmetics";
import { DEFAULT_MORE_GAME_PLAYER_NAME, MORE_GAME_CARDS, PLAYER_NAME_KEY, RATED_MORE_GAME_CARDS, getReadableButtonTextColor, normalizeStoredPlayerName } from "./moregames/shared";
import { styles } from "./moregames/styles";
import { MoreGameLeaderboardPanel } from "./moregames/Ratings";
import { ExtraGameShop } from "./moregames/ExtraGameShop";
import { TicTacToeGame } from "./moregames/TicTacToeGame";
import { SudokuGame } from "./moregames/SudokuGame";
import { MahjongGame } from "./moregames/MahjongGame";
import { BattleshipGame } from "./moregames/BattleshipGame";
import { ChessOnlineGame } from "./moregames/ChessGame";
import { DurakOnlineGame } from "./moregames/DurakGame";
export { CHESS_BOARD_COLORS, CHESS_PIECE_COLORS, MAHJONG_THEMES, CARD_SKINS, SEA_SKINS, SUDOKU_THEMES, pickCosmetic } from "./moregames/cosmetics";
export { getDurakPayout, getDurakNetPrize, useMiniGameRoom } from "./moregames/shared";
export { getTicTacToeWinner } from "./moregames/TicTacToeGame";
export { countSudokuSolutions, generateSudoku } from "./moregames/SudokuGame";
export { createMahjongTiles, isMahjongTileFree, shuffleMahjongTiles } from "./moregames/MahjongGame";
export { createRandomFleet, getShipCells, isShipPlacementValid, getRepeatedShotReply, getSunkShipCells, getCrossedCells, getBattleGridSize } from "./moregames/BattleshipGame";
export { restoreChessGame } from "./moregames/ChessGame";
export { createDurakState, canBeatDurakCard, resolveDurakCardTarget, drawDurakCards, betFromPosition, positionFromBet } from "./moregames/DurakGame";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}
export default function MoreGamesMenu() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { playSfx } = useSoundSettings();

	// A finished game gets a sound: the win jingle, or the soft game-over tone for a loss.
	useEffect(() => subscribeToOutcomes((_game, outcome) => {
		if (outcome === "draw") return;
		void playSfx(outcome === "win" ? "achievement" : "gameOver");
		if (Platform.OS !== "web") {
			void Haptics.notificationAsync(outcome === "win" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
		}
	}), [playSfx]);
	const [, , appendAppState, popAppState] = useAppState();
	const { checked: authChecked, signedIn, name: accountName } = useAccountIdentity();
	const openAccountScreen = (intent: "login" | "register") => {
		setProfileAuthIntent(intent);
		appendAppState(MenuStateType.PROFILE);
	};
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const [activeGame, setActiveGame] = useState<MoreGameId | null>(null);
	const pendingChessInvite = useAtomValue(chessInviteAtom);
	useEffect(() => { if (pendingChessInvite) setActiveGame("chess"); }, [pendingChessInvite]);
	const pendingGameInvite = useAtomValue(gameInviteAtom);
	useEffect(() => { if (pendingGameInvite) setActiveGame(pendingGameInvite.game); }, [pendingGameInvite]);
	const { state: shopState } = useShopState();
	
	const cosmetics: ExtraGameCosmetics = useMemo(() => ({
		chessPieces: pickCosmetic(CHESS_PIECE_COLORS, shopState.equipped.chess_piece, "chess_piece_", "classic"),
		chessBoard: pickCosmetic(CHESS_BOARD_COLORS, shopState.equipped.chess_board, "chess_board_", "slate"),
		sudokuTheme: pickCosmetic(SUDOKU_THEMES, shopState.equipped.sudoku_theme, "sudoku_theme_", "wood"),
		mahjongTheme: pickCosmetic(MAHJONG_THEMES, shopState.equipped.mahjong_theme, "mahjong_theme_", "jade"),
		cardSkin: pickCosmetic(CARD_SKINS, shopState.equipped.card_skin, "card_skin_", "classic"),
		seaSkin: pickCosmetic(SEA_SKINS, shopState.equipped.sea_skin, "sea_skin_", "navy"),
	}), [shopState.equipped]);

	const [playerName, setPlayerName] = useState(DEFAULT_MORE_GAME_PLAYER_NAME);
	const [draftPlayerName, setDraftPlayerName] = useState(DEFAULT_MORE_GAME_PLAYER_NAME);
	const [ratingGame, setRatingGame] = useState<RatedMoreGameId>("chess");
	const [leaderboard, setLeaderboard] = useState<MoreGameRating[]>([]);
	const [myRating, setMyRating] = useState<MoreGameRating | null>(null);
	const [ratingsLoading, setRatingsLoading] = useState(false);
	const [ratingPanel, setRatingPanel] = useState<"list" | "leaderboard">("list");
	const popupScrollRef = useRef<ScrollView>(null);
	useEffect(() => { popupScrollRef.current?.scrollTo({ y: 0, animated: false }); }, [activeGame, ratingPanel]);
	useEffect(() => { if (activeGame) track("more_game_open", { game: activeGame }); }, [activeGame]);

	useEffect(() => {
		AsyncStorage.getItem(PLAYER_NAME_KEY).then((rawName) => {
			const nextName = normalizeStoredPlayerName(rawName);
			setPlayerName(nextName);
			setDraftPlayerName(nextName);
		});
	}, []);

	// A signed-in player's nickname comes from the account and is edited in the profile only.
	useEffect(() => {
		if (!signedIn || !accountName) return;
		const nextName = normalizeStoredPlayerName(accountName);
		setPlayerName(nextName);
		setDraftPlayerName(nextName);
	}, [signedIn, accountName]);

	const loadRatings = useCallback(async (game: RatedMoreGameId = ratingGame, name: string = playerName) => {
		setRatingsLoading(true);
		try {
			const [top, mine] = await Promise.all([
				getMoreGameLeaderboard(game as MoreGameRatingGameId, 100),
				getPlayerMoreGameRating(name, game as MoreGameRatingGameId),
			]);
			setLeaderboard(top);
			setMyRating(mine);
		} finally {
			setRatingsLoading(false);
		}
	}, [playerName, ratingGame]);

	useEffect(() => {
		void loadRatings(ratingGame, playerName);
	}, [loadRatings, playerName, ratingGame]);

	useEffect(() => {
		if (ratingPanel !== "list") {
			void loadRatings();
		}
	}, [loadRatings, ratingPanel]);

	const savePlayerName = useCallback(() => {
		const nextName = normalizeStoredPlayerName(draftPlayerName);
		setPlayerName(nextName);
		setDraftPlayerName(nextName);
		void AsyncStorage.setItem(PLAYER_NAME_KEY, nextName);
		void loadRatings(ratingGame, nextName);
	}, [draftPlayerName, loadRatings, ratingGame]);

	const openRatingPanel = useCallback((panel: "leaderboard", game: RatedMoreGameId = ratingGame) => {
		setActiveGame(null);
		setRatingGame(game);
		setRatingPanel(panel);
		void loadRatings(game, playerName);
	}, [loadRatings, playerName, ratingGame]);

	const handleRatingGameChange = useCallback((game: RatedMoreGameId) => {
		setRatingGame(game);
		void loadRatings(game, playerName);
	}, [loadRatings, playerName]);

	const handleBack = useCallback(() => {
		if (activeGame) {
			setActiveGame(null);
			return;
		}
		if (ratingPanel !== "list") {
			setRatingPanel("list");
			return;
		}
		popAppState();
	}, [activeGame, popAppState, ratingPanel]);

	useEscapeKey(handleBack);

	const activeCard = MORE_GAME_CARDS.find((card) => card.id === activeGame);

	return (
		<SimplePopupView
			scrollRef={popupScrollRef}
			style={[
				{ justifyContent: "flex-start", backgroundColor: currentTheme.menuBackground, height: "80%" },
				isMobile && { width: "94%", height: "92%", paddingHorizontal: 8 },
			]}
		>
			<View style={styles.moreHeaderRow}>
				<StylizedButton text={t("common.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.topBackButton} textStyle={styles.smallButtonText} />
				<Text style={[styles.header, { color: currentTheme.textPrimary, flex: 1, fontSize: 16 }]} numberOfLines={2}>
					{activeCard ? t(`moregames.card.${activeCard.id}.title`) : (ratingPanel === "leaderboard" ? t("moregames.leaderboardTitle") : t("moregames.title"))}
				</Text>
				<View style={styles.topBackButton} />
			</View>
			<Text style={[styles.subHeader, { color: currentTheme.textSecondary, marginBottom: 12 }]}>
				{activeCard ? t(`moregames.help.${activeCard.id}`) : ratingPanel !== "list" ? t("moregames.subtitleRatings", { game: t(`moregames.label.${ratingGame}`) }) : t("moregames.subtitleList")}
			</Text>

			{ratingPanel === "leaderboard" ? (
				<MoreGameLeaderboardPanel
					gameId={ratingGame}
					onGameChange={handleRatingGameChange}
					leaderboard={leaderboard}
					myRating={myRating}
					loading={ratingsLoading}
					playerName={playerName}
					onRefresh={() => loadRatings()}
				/>
			) : !activeGame ? (
				<ScrollView style={styles.moreList} contentContainerStyle={styles.moreListContent}>
					<View style={styles.moreTopPanel}>
						{authChecked && !signedIn && (
						<View style={styles.guestRow}>
							<View style={[styles.guestAvatar, { borderColor: currentTheme.accent }]}>
								<Text style={[styles.guestAvatarText, { color: currentTheme.textPrimary }]}>{(draftPlayerName.trim()[0] || "?").toUpperCase()}</Text>
							</View>
							<View style={{ flex: 1, minWidth: 0 }}>
								<TextInput
									value={draftPlayerName}
									onChangeText={setDraftPlayerName}
									onBlur={savePlayerName}
									onSubmitEditing={savePlayerName}
									placeholder={t("moregames.playerNamePlaceholder")}
									placeholderTextColor={currentTheme.textSecondary}
									maxLength={24}
									style={[styles.guestNameInput, { color: currentTheme.textPrimary }]}
								/>
								<Text style={[styles.guestHint, { color: currentTheme.textSecondary }]} numberOfLines={1}>{t("moregames.guestHint")}</Text>
							</View>
							<StylizedButton text={t("moregames.signIn")} onClick={() => openAccountScreen("login")} backgroundColor={currentTheme.accent} style={styles.guestSignIn} textStyle={styles.tinyButtonText} />
						</View>
						)}
						<View style={styles.moreQuickActions}>
							<StylizedButton text={t("moregames.shopButton")} onClick={() => setActiveGame("shop")} backgroundColor="#FACC15" style={styles.shopQuickButton} textStyle={[styles.tinyButtonText, { color: "#111827" }]} />
							<StylizedButton text={t("moregames.leaderboardTitle")} onClick={() => openRatingPanel("leaderboard")} backgroundColor={currentTheme.buttonPrimary} style={styles.leaderboardQuickButton} textStyle={styles.tinyButtonText} />
						</View>
					</View>
					{RATED_MORE_GAME_CARDS.map((card, cardIndex) => (
						<FadeInView key={card.id} index={cardIndex}>
						<View
							style={[
								styles.moreGameRow,
								{
									borderColor: card.color,
									backgroundColor: "rgba(0, 0, 0, 0.28)",
								},
							]}
						>
							<View style={styles.cardMain}>
								<Text style={[styles.cardTitle, { color: card.color }]} numberOfLines={2} adjustsFontSizeToFit>
									{t(`moregames.card.${card.id}.title`)}
								</Text>
								<Text style={[styles.cardDesc, { color: currentTheme.textPrimary }]} numberOfLines={2}>
									{t(`moregames.card.${card.id}.desc`)}
								</Text>
								<View style={styles.tagRow}>
									{card.tags.slice(0, 2).map((tag) => {
										const tagLabel = t(`moregames.tag.${tag}`);
										return (
											<View key={tag} style={[styles.tag, { borderColor: card.color }]}>
												<Text style={[styles.tagText, { color: card.color }]}>{tagLabel.startsWith("moregames.") ? tag : tagLabel}</Text>
											</View>
										);
									})}
								</View>
							</View>
							<StylizedButton
								text={t("common.play")}
								onClick={() => setActiveGame(card.id)}
								backgroundColor={card.color}
								style={styles.playButton}
								textStyle={[styles.smallButtonText, { color: getReadableButtonTextColor(card.color) }]}
							/>
						</View>
						</FadeInView>
					))}
				</ScrollView>
			) : (
				<View style={styles.gameSurface}>
					{activeGame === "shop" && <ExtraGameShop />}
					{activeGame === "tictactoe" && <TicTacToeGame playerName={playerName} onRatingChange={() => loadRatings("tictactoe")} />}
					{activeGame === "sudoku" && <SudokuGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("sudoku")} />}
					{activeGame === "mahjong" && <MahjongGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("mahjong")} />}
					{activeGame === "battleship" && <BattleshipGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("battleship")} />}
					{activeGame === "chess" && <ChessOnlineGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("chess")} />}
					{activeGame === "durak" && <DurakOnlineGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("durak")} />}
				</View>
			)}
		</SimplePopupView>
	);
}