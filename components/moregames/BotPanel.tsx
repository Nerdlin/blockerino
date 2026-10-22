import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Collapsible from "../Collapsible";
import SegmentedControl from "../SegmentedControl";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { BotDifficulty, isBotDifficulty } from "@/constants/bots/Difficulty";
import { styles } from "./styles";

const BOT_SETTINGS_KEY = "MOREGAMES_BOT_SETTINGS_V1";

interface StoredBotSettings {
	difficulty?: BotDifficulty;
	vsBot?: Record<string, boolean>;
}

/**
 * Whether a game is played against the computer, and how hard it plays. Both are remembered per device.
 * The bot works offline and without an account; games against it never touch ratings or coins.
 */
export function useBotSettings(gameId: string) {
	const [difficulty, setDifficultyState] = useState<BotDifficulty>("medium");
	const [vsBot, setVsBotState] = useState(false);

	useEffect(() => {
		let active = true;
		void (async () => {
			try {
				const raw = await AsyncStorage.getItem(BOT_SETTINGS_KEY);
				const stored: StoredBotSettings = raw ? JSON.parse(raw) : {};
				if (!active) return;
				if (isBotDifficulty(stored.difficulty)) setDifficultyState(stored.difficulty);
				if (stored.vsBot?.[gameId]) setVsBotState(true);
			} catch {
				// defaults are fine
			}
		})();
		return () => {
			active = false;
		};
	}, [gameId]);

	const save = useCallback(async (patch: (current: StoredBotSettings) => StoredBotSettings) => {
		try {
			const raw = await AsyncStorage.getItem(BOT_SETTINGS_KEY);
			const current: StoredBotSettings = raw ? JSON.parse(raw) : {};
			await AsyncStorage.setItem(BOT_SETTINGS_KEY, JSON.stringify(patch(current)));
		} catch {
			// not remembering the choice is harmless
		}
	}, []);

	const setDifficulty = useCallback((next: BotDifficulty) => {
		setDifficultyState(next);
		void save((current) => ({ ...current, difficulty: next }));
	}, [save]);

	const setVsBot = useCallback((next: boolean) => {
		setVsBotState(next);
		void save((current) => ({ ...current, vsBot: { ...current.vsBot, [gameId]: next } }));
	}, [gameId, save]);

	return { difficulty, setDifficulty, vsBot, setVsBot };
}

export function BotPanel({
	vsBot,
	onVsBotChange,
	difficulty,
	onDifficultyChange,
	friendLabel,
}: {
	vsBot: boolean;
	onVsBotChange: (next: boolean) => void;
	difficulty: BotDifficulty;
	onDifficultyChange: (next: BotDifficulty) => void;
	/** What the non-bot option is called: "Friend" for local two-player games, "Online" where the other side is a room. */
	friendLabel?: string;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	return (
		<View style={styles.botPanel}>
			<Text style={[styles.botPanelTitle, { color: currentTheme.textSecondary }]}>{t("bot.opponent")}</Text>
			<SegmentedControl
				small
				value={vsBot ? "bot" : "friend"}
				onChange={(key) => onVsBotChange(key === "bot")}
				items={[
					{ key: "friend", label: friendLabel ?? t("bot.friend") },
					{ key: "bot", label: t("bot.computer") },
				]}
			/>
			<Collapsible visible={vsBot}>
				<View style={{ gap: 6, alignItems: "center", paddingTop: 6 }}>
					<Text style={[styles.botPanelTitle, { color: currentTheme.textSecondary }]}>{t("bot.difficulty")}</Text>
					<SegmentedControl
						small
						value={difficulty}
						onChange={onDifficultyChange}
						items={[
							{ key: "easy", label: t("bot.easy"), color: "#22C55E" },
							{ key: "medium", label: t("bot.medium"), color: "#F59E0B" },
							{ key: "hard", label: t("bot.hard"), color: "#EF4444" },
						]}
					/>
					<Text style={[styles.botPanelHint, { color: currentTheme.textSecondary }]}>{t("bot.noRewards")}</Text>
				</View>
			</Collapsible>
		</View>
	);
}
