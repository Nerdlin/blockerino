import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/constants/Supabase";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAtom } from "jotai";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import PerkBadge from "./PerkBadge";
import UiIcon from "./UiIcon";
import AchievementIcon from "./AchievementIcon";
import { getEloBadge } from "./MultiplayerMenu";
import PixelLoader from "./PixelLoader";
import SegmentedControl from "./SegmentedControl";
import { AchievementMedal, GameRow, ProfileBanner, ScoreBadge, Section, StatCell } from "./ProfileDesign";
import { rarityPercent, rarityClass, useAchievementRarity } from "@/constants/AchievementRarity";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { RECORDED_GAME_IDS, emptyGameRecord, gamesPlayed } from "@/constants/GameStats";
import { useAvatarColor } from "@/constants/AvatarColor";
import { useLeaderboardPerk } from "@/constants/LeaderboardPerks";
import { nameFontFamily } from "@/constants/NameFont";
import { reportAvatar, type AvatarReportReason } from "@/constants/AvatarUpload";
import {
	acceptFriendRequest,
	deleteFriendRow,
	fetchPublicProfile,
	sendFriendRequestTo,
	syncGameRecords,
	viewedPlayerAtom,
	type ProfileLoad,
	type PublicProfile,
} from "@/constants/PlayerProfile";

const SCORE_MODES = ["classic", "chaos", "time_attack", "daily", "move_limit"] as const;
const MODE_COLORS: Record<(typeof SCORE_MODES)[number], string> = {
	classic: "#FF5A5A",
	chaos: "#A78BFA",
	time_attack: "#00FFCC",
	daily: "#FFD700",
	move_limit: "#FF7A85",
};

// Another player's profile, opened from friends, leaderboards and rankings. The server decides how much of it
// this viewer may see; a hidden profile still shows the name, avatar and the friend buttons.
export default function PlayerProfileHost() {
	const [viewed, setViewed] = useAtom(viewedPlayerAtom);

	// The record of every game goes to the account at start and after sign-in; later results are pushed one by one.
	useEffect(() => {
		const timer = setTimeout(() => void syncGameRecords(), 6000);
		const { data } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN") void syncGameRecords();
		});
		return () => {
			clearTimeout(timer);
			data.subscription.unsubscribe();
		};
	}, []);

	if (!viewed) return null;
	return <PlayerProfileView key={viewed.toLowerCase()} name={viewed} onClose={() => setViewed(null)} />;
}

function PlayerProfileView({ name, onClose }: { name: string; onClose: () => void }) {
	const { currentTheme } = useTheme();
	const { t, language } = useLanguage();
	const { playSfx } = useSoundSettings();
	const { signedIn } = useAccountIdentity();
	const [load, setLoad] = useState<ProfileLoad | null>(null);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const mounted = useRef(true);
	const perk = useLeaderboardPerk(name);

	const reload = useCallback(async () => {
		const next = await fetchPublicProfile(name);
		if (mounted.current) setLoad(next);
	}, [name]);

	useEffect(() => {
		mounted.current = true;
		void reload();
		return () => {
			mounted.current = false;
		};
	}, [reload]);

	const close = useCallback(() => {
		void playSfx("menuClick");
		onClose();
	}, [onClose, playSfx]);
	useEscapeKey(close);

	const act = async (action: () => Promise<boolean>) => {
		if (busy) return;
		setBusy(true);
		setFailed(false);
		const ok = await action();
		if (!mounted.current) return;
		setBusy(false);
		if (!ok) {
			setFailed(true);
			return;
		}
		await reload();
	};

	const profile = load?.kind === "ok" ? load.profile : null;
	const nameColor = perk?.tier.color ?? currentTheme.textPrimary;
	// the banner and the frame take the colour of the avatar picture
	const bannerColor = useAvatarColor(profile?.avatarUrl, profile && profile.elo && profile.elo > 0 ? getEloBadge(profile.elo).color : currentTheme.accent);

	return (
		<>
		<Pressable accessibilityLabel={t("pp.close")} onPress={close} style={styles.scrim} />
		<SimplePopupView
			style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]}
			footer={<StylizedButton text={t("pp.close")} onClick={close} backgroundColor={currentTheme.buttonSecondary} />}
		>
			{!load && (
				<View style={styles.center}>
					<PixelLoader />
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("pp.loading")}</Text>
				</View>
			)}
			{load?.kind === "not_found" && <Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("pp.notFound")}</Text>}
			{load?.kind === "error" && (
				<View style={styles.center}>
					<Text style={[styles.note, { color: "#F87171" }]}>{t("pp.error")}</Text>
					<StylizedButton text={t("pp.retry")} onClick={() => { setLoad(null); void reload(); }} backgroundColor={currentTheme.buttonPrimary} />
				</View>
			)}
			{profile && (
				<View style={styles.column}>
					<ProfileBanner
						name={profile.name}
						nameColor={nameColor}
						color={bannerColor}
						avatarUrl={profile.avatarUrl}
					>
						{perk && <PerkBadge perk={perk} />}
						<VersusChip profile={profile} />
						<MemberSince profile={profile} language={language} />
					</ProfileBanner>
					<Relation
						profile={profile}
						signedIn={signedIn}
						busy={busy}
						onAdd={() => profile.userId && act(() => sendFriendRequestTo(profile.userId as string))}
						onAccept={() => profile.friendRowId && act(() => acceptFriendRequest(profile.friendRowId as string))}
						onDelete={() => profile.friendRowId && act(() => deleteFriendRow(profile.friendRowId as string))}
					/>
					{failed && <Text style={[styles.note, { color: "#F87171" }]}>{t("pp.friendFailed")}</Text>}
					{signedIn && profile.userId && profile.relation !== "self" && profile.avatarUrl?.startsWith("http") ? (
						<ReportAvatar userId={profile.userId} />
					) : null}

					{profile.status === "hidden" ? (
						<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("pp.hiddenNobody")}</Text>
					) : (
						<Details profile={profile} language={language} />
					)}
				</View>
			)}
		</SimplePopupView>
		</>
	);
}

/** The Versus rank as a small chip: its medal, the tier and the rating. */
function VersusChip({ profile }: { profile: PublicProfile }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const rated = !!profile.elo && profile.elo > 0;
	const badge = rated ? getEloBadge(profile.elo as number) : null;
	return (
		<View style={[styles.versusChip, { borderColor: badge?.color ?? currentTheme.gridBorder }]}>
			{badge ? <UiIcon name={badge.icon} size={18} /> : null}
			<Text style={[styles.versusText, { color: badge?.color ?? currentTheme.textSecondary }]} numberOfLines={1}>
				{badge ? `${t(`mp.tierName.${badge.tier}`)} · ${profile.elo}` : t("pp.noRating")}
			</Text>
		</View>
	);
}

function MemberSince({ profile, language }: { profile: PublicProfile; language: string }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const since = profile.memberSince ? new Date(profile.memberSince) : null;
	if (!since || Number.isNaN(since.getTime())) return null;
	return (
		<Text style={[styles.note, { color: currentTheme.textSecondary }]}>
			{t("pp.memberSince", { date: since.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { year: "numeric", month: "long" }) })}
		</Text>
	);
}

// A complaint about another player's picture (Google Play requires a way to report user-made content).
function ReportAvatar({ userId }: { userId: string }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [step, setStep] = useState<"idle" | "choose" | "sent" | "failed">("idle");
	const send = async (reason: AvatarReportReason) => {
		setStep((await reportAvatar(userId, reason)) ? "sent" : "failed");
	};
	if (step === "sent") return <Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("pp.reportSent")}</Text>;
	if (step === "idle" || step === "failed") {
		return (
			<>
				{step === "failed" && <Text style={[styles.note, { color: "#F87171" }]}>{t("pp.reportFailed")}</Text>}
				<Pressable accessibilityRole="button" onPress={() => setStep("choose")}>
					<Text style={[styles.note, { color: currentTheme.textSecondary, textDecorationLine: "underline" }]}>{t("pp.reportAvatar")}</Text>
				</Pressable>
			</>
		);
	}
	return (
		<View style={styles.column}>
			<Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("pp.reportTitle")}</Text>
			<StylizedButton text={t("pp.reportInappropriate")} onClick={() => void send("inappropriate")} backgroundColor="rgb(200,50,50)" style={styles.action} textStyle={styles.actionText} />
			<StylizedButton text={t("pp.reportPersonal")} onClick={() => void send("personal")} backgroundColor="rgb(200,50,50)" style={styles.action} textStyle={styles.actionText} />
			<StylizedButton text={t("pp.reportOther")} onClick={() => void send("other")} backgroundColor="rgb(150,150,150)" style={styles.action} textStyle={styles.actionText} />
		</View>
	);
}

function Relation({
	profile,
	signedIn,
	busy,
	onAdd,
	onAccept,
	onDelete,
}: {
	profile: PublicProfile;
	signedIn: boolean;
	busy: boolean;
	onAdd: () => void;
	onAccept: () => void;
	onDelete: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	if (profile.relation === "self") {
		return <Text style={[styles.note, { color: currentTheme.accent }]}>{t("pp.you")}</Text>;
	}
	if (!signedIn || !profile.userId) {
		return profile.userId ? <Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t("pp.signInToAdd")}</Text> : null;
	}
	switch (profile.relation) {
		case "friend":
			return <StylizedButton text={t("pp.removeFriend")} onClick={onDelete} disabled={busy} backgroundColor="rgb(200,50,50)" style={styles.action} textStyle={styles.actionText} />;
		case "pending_out":
			return <StylizedButton text={t("pp.requestSent")} onClick={onDelete} disabled={busy} backgroundColor="rgb(150,150,150)" style={styles.action} textStyle={styles.actionText} />;
		case "pending_in":
			return (
				<View style={styles.actionRow}>
					<StylizedButton text={t("pp.accept")} onClick={onAccept} disabled={busy} backgroundColor="rgb(50,200,50)" style={styles.action} textStyle={styles.actionText} />
					<StylizedButton text={t("pp.decline")} onClick={onDelete} disabled={busy} backgroundColor="rgb(200,50,50)" style={styles.action} textStyle={styles.actionText} />
				</View>
			);
		default:
			return <StylizedButton text={t("pp.addFriend")} onClick={onAdd} disabled={busy} backgroundColor={currentTheme.buttonPrimary} style={styles.action} textStyle={styles.actionText} />;
	}
}

function Details({ profile }: { profile: PublicProfile; language: string }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const rarity = useAchievementRarity();
	const totals = RECORDED_GAME_IDS.reduce(
		(sum, id) => {
			const record = profile.records[id] ?? emptyGameRecord();
			return { wins: sum.wins + record.wins + record.botWins, games: sum.games + gamesPlayed(record) };
		},
		{ wins: 0, games: 0 }
	);
	const peopleGames = RECORDED_GAME_IDS.reduce((sum, id) => sum + (profile.records[id]?.wins ?? 0) + (profile.records[id]?.losses ?? 0) + (profile.records[id]?.draws ?? 0), 0);
	const [opponents, setOpponents] = useState<"people" | "bots">(peopleGames > 0 ? "people" : "bots");
	const rated = !!profile.elo && profile.elo > 0;
	const badge = rated ? getEloBadge(profile.elo as number) : null;
	const scores = SCORE_MODES.map((mode) => ({ mode, score: profile.highScores?.[mode] ?? 0 })).filter((entry) => entry.score > 0);
	const rows = RECORDED_GAME_IDS.map((id) => {
		const record = profile.records[id] ?? emptyGameRecord();
		return opponents === "people"
			? { id, wins: record.wins, draws: record.draws, losses: record.losses }
			: { id, wins: record.botWins, draws: record.botDraws, losses: record.botLosses };
	}).filter((row) => row.wins + row.draws + row.losses > 0);

	return (
		<>
			<Section label={t("pp.overview")} index={0}>
				<View style={styles.statGrid}>
					<StatCell icon={badge?.icon ?? "shield"} value={rated ? (profile.elo as number) : undefined} text={rated ? undefined : "-"} label={badge ? t(`mp.tierName.${badge.tier}`) : t("pp.noRatingShort")} color={badge?.color} />
					<StatCell icon="starGold" value={totals.wins} label={t("pp.statWins")} />
					<StatCell icon="dice" value={totals.games} label={t("pp.statGames")} />
					<StatCell icon="scales" value={totals.games > 0 ? Math.round((totals.wins / totals.games) * 100) : 0} label={t("pp.statRate")} />
				</View>
			</Section>

			<Section label={t("pp.highScores")} index={1}>
				{scores.length === 0 ? (
					<Text style={[styles.cardNote, { color: currentTheme.textSecondary }]}>{t("pp.noScores")}</Text>
				) : (
					<View style={styles.grid}>
						{scores.map((entry) => (
							<ScoreBadge key={entry.mode} value={entry.score} label={t(`pp.mode.${entry.mode}`)} color={MODE_COLORS[entry.mode]} />
						))}
					</View>
				)}
			</Section>

			<Section label={t("pp.gamesTitle")} index={2}>
				<SegmentedControl
					small
					items={[{ key: "people", label: t("record.people") }, { key: "bots", label: t("record.bots") }]}
					value={opponents}
					onChange={setOpponents}
				/>
				{rows.length === 0 ? (
					<Text style={[styles.cardNote, { color: currentTheme.textSecondary }]}>{t("pp.noRecords")}</Text>
				) : (
					rows.map((row, index) => (
						<GameRow key={`${opponents}-${row.id}`} name={row.id === "versus" ? t("record.versus") : t(`moregames.label.${row.id}`)} wins={row.wins} draws={row.draws} losses={row.losses} delay={index * 60} />
					))
				)}
			</Section>

			<Section label={t("pp.achTitle")} index={3}>
				{profile.achievements.length === 0 ? (
					<Text style={[styles.cardNote, { color: currentTheme.textSecondary }]}>{t("pp.noAchievements")}</Text>
				) : (
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.medalRow}>
						{profile.achievements.map((item) => {
							const percent = rarityPercent(rarity, item.id);
							return (
								<AchievementMedal
									key={item.id}
									id={item.id}
									title={t(`ach.${item.id}.title`)}
									percent={percent}
									tag={percent !== null && rarityClass(percent) === "epic" ? t("ach.rarity.epic") : null}
								/>
							);
						})}
					</ScrollView>
				)}
			</Section>
		</>
	);
}

const styles = StyleSheet.create({
	// Dims whatever screen the profile was opened from, so its frame does not show through next to the profile's own.
	scrim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		// Same level as the popups: it comes after them in the tree, so it covers them, and the profile popup comes after it.
		zIndex: 100,
		backgroundColor: "rgba(4, 3, 10, 0.92)",
	},
	center: {
		alignItems: "center",
		gap: 12,
	},
	column: {
		width: "100%",
		alignItems: "center",
		gap: 10,
	},
	header: {
		alignItems: "center",
		gap: 8,
		width: "100%",
		paddingVertical: 14,
		paddingHorizontal: 12,
		borderRadius: 14,
		borderWidth: 2,
	},
	headerInfo: {
		width: "100%",
		alignItems: "center",
		gap: 8,
	},
	avatarRing: {
		width: 104,
		height: 104,
		borderRadius: 52,
		borderWidth: 4,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	avatarImage: {
		width: "100%",
		height: "100%",
	},
	avatarFallback: {
		width: "100%",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	hero: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		borderWidth: 2,
		borderRadius: 12,
		paddingVertical: 10,
	},
	heroTier: {
		fontFamily: "SilkscreenBold",
		fontSize: 16,
	},
	heroValue: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		marginTop: 2,
	},
	sectionTitle: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		alignSelf: "flex-start",
		marginTop: 6,
	},
	grid: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	statGrid: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: 12,
		rowGap: 6,
	},
	medalRow: {
		gap: 10,
		paddingVertical: 2,
	},
	tile: {
		flexGrow: 1,
		flexBasis: "30%",
		minWidth: 90,
		borderWidth: 2,
		borderRadius: 10,
		paddingVertical: 8,
		paddingHorizontal: 6,
		alignItems: "center",
		gap: 2,
	},
	tileValue: {
		fontFamily: "SilkscreenBold",
		fontSize: 18,
		maxWidth: "100%",
	},
	tileLabel: {
		fontFamily: "Silkscreen",
		fontSize: 9,
	},
	achGrid: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	achCard: {
		flexGrow: 1,
		flexBasis: "30%",
		minWidth: 96,
		alignItems: "center",
		gap: 4,
		borderWidth: 1.5,
		borderRadius: 10,
		paddingVertical: 8,
		paddingHorizontal: 6,
	},
	achTitle: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		textAlign: "center",
		minHeight: 24,
	},
	versusChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 8,
		borderWidth: 1.5,
		backgroundColor: "rgba(255,255,255,0.05)",
	},
	versusText: {
		fontFamily: "SilkscreenBold",
		fontSize: 11,
		flexShrink: 1,
	},
	achRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderWidth: 1,
		borderRadius: 10,
		padding: 8,
	},
	avatarText: {
		fontSize: 28,
		color: "#fff",
	},
	name: {
		fontFamily: "Silkscreen",
		fontSize: 22,
		maxWidth: "100%",
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	rating: {
		fontFamily: "Silkscreen",
		fontSize: 13,
	},
	action: {
		minWidth: 0,
		minHeight: 34,
		paddingHorizontal: 12,
		margin: 0,
	},
	actionText: {
		fontSize: 11,
	},
	actionRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		justifyContent: "center",
	},
	card: {
		width: "100%",
		padding: 10,
		borderWidth: 2,
		borderRadius: 10,
		gap: 6,
	},
	cardTitle: {
		fontFamily: "Silkscreen",
		fontSize: 13,
	},
	cardNote: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	line: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	lineLabel: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	lineValue: {
		fontFamily: "Silkscreen",
		fontSize: 12,
	},
	reward: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
});
