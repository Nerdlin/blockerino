import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { supabase } from "@/constants/Supabase";
import { getShopItem, loadShopState, useShopState } from "@/constants/Shop";
import { MenuStateType, useAppStateValue, useSetAppState } from "@/hooks/useAppState";
import {
	claimSeasonRewards,
	clearPendingSeasonRewards,
	getUnseenEloReset,
	markEloResetSeen,
	summarizeSeasonRewards,
	type EloSeasonReset,
	type SeasonRewardSummary,
} from "@/constants/SeasonResults";

interface SeasonNotice {
	rewards: SeasonRewardSummary | null;
	eloReset: EloSeasonReset | null;
}

// After a season closes: collects the player's rewards once, puts them into the shop wallet and
// tells the player about them (and about the Versus rating reset). Shown from the main menu only,
// so it never interrupts a game.
export default function SeasonRewardsHost() {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const { commit } = useShopState();
	const appState = useAppStateValue();
	const [, appendAppState] = useSetAppState();
	const [notice, setNotice] = useState<SeasonNotice | null>(null);
	const running = useRef(false);
	// commit changes whenever the shop state does; keep check() stable so the listeners below are
	// registered once instead of re-claiming on every wallet change.
	const commitRef = useRef(commit);
	commitRef.current = commit;

	const check = useCallback(async () => {
		if (running.current) return;
		running.current = true;
		try {
			const entries = await claimSeasonRewards();
			let rewards: SeasonRewardSummary | null = null;
			if (entries.length > 0) {
				rewards = summarizeSeasonRewards(entries);
				// The server has already credited the coins and the podium cosmetic; adopt its wallet.
				const latest = await loadShopState();
				await commitRef.current(latest, []);
				await clearPendingSeasonRewards();
			}

			const eloReset = await getUnseenEloReset();
			if (eloReset) await markEloResetSeen(eloReset.resetAt);

			if (rewards || eloReset) {
				setNotice((current) => current ?? { rewards, eloReset });
			}
		} catch (error) {
			console.error("Error processing season close:", error);
		} finally {
			running.current = false;
		}
	}, []);

	useEffect(() => {
		const startTimer = setTimeout(() => void check(), 2500);
		const appStateSub = AppState.addEventListener("change", (next) => {
			if (next === "active") void check();
		});
		const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN") void check();
		});

		return () => {
			clearTimeout(startTimer);
			appStateSub.remove();
			authSub.subscription.unsubscribe();
		};
	}, [check]);

	if (!notice || appState.current !== MenuStateType.MENU) return null;

	const { rewards, eloReset } = notice;
	const seasonKey = rewards?.entries[0]?.seasonKey;

	const close = () => setNotice(null);
	const openResults = () => {
		setNotice(null);
		appendAppState(MenuStateType.SEASON_RESULTS);
	};

	return (
		<SimplePopupView style={[{ backgroundColor: currentTheme.menuBackground }]}>
			<Text style={[styles.title, { color: currentTheme.buttonPrimary }]}>
				{seasonKey ? t("season.endedTitle", { season: seasonKey }) : t("season.viewResults")}
			</Text>

			{rewards && (
				<View style={styles.block}>
					<Text style={[styles.sectionHeader, { color: currentTheme.textSecondary }]}>{t("season.rewardsHeader")}</Text>
					{rewards.entries.map((entry) => (
						<Text key={`${entry.seasonKey}-${entry.board}`} style={[styles.line, { color: currentTheme.textPrimary }]}>
							{t("season.rewardPlace", { board: t(`perk.board.${entry.board}`), rank: entry.rank })}
						</Text>
					))}
					{rewards.coins > 0 && (
						<Text style={[styles.reward, { color: "#FFD700" }]}>{t("season.rewardCoins", { coins: rewards.coins })}</Text>
					)}
					{rewards.itemIds.map((id) => (
						<Text key={id} style={[styles.reward, { color: currentTheme.accent }]}>
							{t("season.rewardItem", { name: getShopItem(id)?.title ?? id })}
						</Text>
					))}
				</View>
			)}

			{eloReset && (
				<View style={styles.block}>
					<Text style={[styles.reward, { color: currentTheme.textPrimary }]}>
						{t("season.eloReset", { before: eloReset.before, after: eloReset.after })}
					</Text>
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("season.eloResetNote")}</Text>
				</View>
			)}

			<View style={styles.buttons}>
				<StylizedButton text={t("season.viewResults")} onClick={openResults} backgroundColor={currentTheme.buttonPrimary} />
				<StylizedButton text={t("season.ok")} onClick={close} backgroundColor={currentTheme.buttonSecondary} />
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	title: {
		fontFamily: "Silkscreen",
		fontSize: 24,
		textAlign: "center",
		marginBottom: 16,
	},
	block: {
		alignItems: "center",
		gap: 6,
		marginBottom: 16,
	},
	sectionHeader: {
		fontFamily: "Silkscreen",
		fontSize: 13,
	},
	line: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		textAlign: "center",
	},
	reward: {
		fontFamily: "Silkscreen",
		fontSize: 18,
		textAlign: "center",
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	buttons: {
		gap: 8,
		alignItems: "center",
		marginTop: 8,
	},
});
