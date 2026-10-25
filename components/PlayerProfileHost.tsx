import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/constants/Supabase";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useAtom } from "jotai";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import PerkBadge from "./PerkBadge";
import UiIcon from "./UiIcon";
import { GameRecordsView } from "./GameRecordsCard";
import PixelLoader from "./PixelLoader";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { useLeaderboardPerk } from "@/constants/LeaderboardPerks";
import { nameFontFamily } from "@/constants/NameFont";
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
					<Header profile={profile} nameColor={nameColor} />
					{perk && <PerkBadge perk={perk} />}

					<Relation
						profile={profile}
						signedIn={signedIn}
						busy={busy}
						onAdd={() => profile.userId && act(() => sendFriendRequestTo(profile.userId as string))}
						onAccept={() => profile.friendRowId && act(() => acceptFriendRequest(profile.friendRowId as string))}
						onDelete={() => profile.friendRowId && act(() => deleteFriendRow(profile.friendRowId as string))}
					/>
					{failed && <Text style={[styles.note, { color: "#F87171" }]}>{t("pp.friendFailed")}</Text>}

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

function Header({ profile, nameColor }: { profile: PublicProfile; nameColor: string }) {
	const { currentTheme } = useTheme();
	const avatar = profile.avatarUrl;
	return (
		<View style={styles.header}>
			{avatar && avatar.startsWith("http") ? (
				<Image source={{ uri: avatar }} style={[styles.avatar, { backgroundColor: "transparent" }]} />
			) : (
				<View style={[styles.avatar, { borderColor: currentTheme.accent }]}>
					<Text style={styles.avatarText}>{avatar || profile.name.charAt(0).toUpperCase()}</Text>
				</View>
			)}
			<Text style={[styles.name, { color: nameColor, fontFamily: nameFontFamily(profile.name) }]} numberOfLines={1} adjustsFontSizeToFit>
				{profile.name}
			</Text>
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
			return <StylizedButton text={t("pp.removeFriend")} onClick={onDelete} disabled={busy} backgroundColor="rgb(200,50,50)" style={styles.action} />;
		case "pending_out":
			return <StylizedButton text={t("pp.requestSent")} onClick={onDelete} disabled={busy} backgroundColor="rgb(150,150,150)" style={styles.action} />;
		case "pending_in":
			return (
				<View style={styles.actionRow}>
					<StylizedButton text={t("pp.accept")} onClick={onAccept} disabled={busy} backgroundColor="rgb(50,200,50)" style={styles.action} />
					<StylizedButton text={t("pp.decline")} onClick={onDelete} disabled={busy} backgroundColor="rgb(200,50,50)" style={styles.action} />
				</View>
			);
		default:
			return <StylizedButton text={t("pp.addFriend")} onClick={onAdd} disabled={busy} backgroundColor={currentTheme.buttonPrimary} style={styles.action} />;
	}
}

function Details({ profile, language }: { profile: PublicProfile; language: string }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const scores = SCORE_MODES.map((mode) => ({ mode, score: profile.highScores?.[mode] ?? 0 })).filter((entry) => entry.score > 0);
	const since = profile.memberSince ? new Date(profile.memberSince) : null;
	return (
		<>
			<Text style={[styles.rating, { color: currentTheme.accent }]}>
				{profile.elo && profile.elo > 0 ? t("pp.versusRating", { elo: profile.elo }) : t("pp.noRating")}
			</Text>

			<View style={[styles.card, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
				<Text style={[styles.cardTitle, { color: currentTheme.textPrimary }]}>{t("pp.highScores")}</Text>
				{scores.length === 0 ? (
					<Text style={[styles.cardNote, { color: currentTheme.textSecondary }]}>{t("pp.noScores")}</Text>
				) : (
					scores.map((entry) => (
						<View key={entry.mode} style={styles.line}>
							<Text style={[styles.lineLabel, { color: currentTheme.textPrimary }]} numberOfLines={1}>
								{t(`pp.mode.${entry.mode}`)}
							</Text>
							<Text style={[styles.lineValue, { color: currentTheme.accent }]}>{entry.score}</Text>
						</View>
					))
				)}
			</View>

			<GameRecordsView records={profile.records} title={t("pp.records")} emptyText={t("pp.noRecords")} />

			<View style={[styles.card, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
				<Text style={[styles.cardTitle, { color: currentTheme.textPrimary }]}>{t("pp.rarest")}</Text>
				{profile.achievements.length === 0 ? (
					<Text style={[styles.cardNote, { color: currentTheme.textSecondary }]}>{t("pp.noAchievements")}</Text>
				) : (
					profile.achievements.map((item) => (
						<View key={item.id} style={styles.line}>
							<Text style={[styles.lineLabel, { color: currentTheme.textPrimary }]} numberOfLines={2}>
								{t(`ach.${item.id}.title`)}
							</Text>
							<View style={styles.reward}>
								<UiIcon name="coin" size={12} />
								<Text style={[styles.lineValue, { color: currentTheme.accent }]}>{item.reward}</Text>
							</View>
						</View>
					))
				)}
			</View>

			{since && !Number.isNaN(since.getTime()) && (
				<Text style={[styles.note, { color: currentTheme.textSecondary }]}>
					{t("pp.memberSince", { date: since.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { year: "numeric", month: "long" }) })}
				</Text>
			)}
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
	},
	avatar: {
		width: 64,
		height: 64,
		borderRadius: 32,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.3)",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	avatarText: {
		fontSize: 28,
		color: "#fff",
	},
	name: {
		fontFamily: "Silkscreen",
		fontSize: 22,
		maxWidth: "90%",
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
		minWidth: 150,
		margin: 0,
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
