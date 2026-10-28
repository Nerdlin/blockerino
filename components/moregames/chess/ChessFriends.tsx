import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "@/constants/Supabase";
import { fetchFriendsOnline } from "@/constants/Invites";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { ChessRatings, fetchFriendChessRatings } from "@/constants/chess/ChessRatingsApi";
import { START_RATING } from "@/constants/chess/ChessElo";
import { TimeControl } from "@/constants/chess/TimeControls";
import StylizedButton from "../../StylizedButton";

export interface ChessFriend {
	id: string;
	name: string;
}

interface Row extends ChessFriend {
	online: boolean;
	ratings: ChessRatings | null;
}

/**
 * "Play a friend", like chess.com's: the friends of a signed-in player with an online mark and their rating in the
 * chosen time class, a challenge button for each, and a way in for people who just share a room code.
 */
export function ChessFriends({
	control,
	onChallenge,
	onPlayWithCode,
	onBack,
}: {
	control: TimeControl;
	onChallenge: (friend: ChessFriend) => void;
	onPlayWithCode: () => void;
	onBack: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [rows, setRows] = useState<Row[] | null>(null);
	const [signedIn, setSignedIn] = useState(true);

	useEffect(() => {
		let active = true;
		void (async () => {
			const { data: session } = await supabase.auth.getSession();
			const me = session.session?.user?.id;
			if (!me) {
				if (active) {
					setSignedIn(false);
					setRows([]);
				}
				return;
			}
			const { data } = await supabase
				.from("friends")
				.select("user_id_1, user_id_2, status")
				.or(`user_id_1.eq.${me},user_id_2.eq.${me}`)
				.eq("status", "accepted");
			const ids = (data ?? []).map((row) => (row.user_id_1 === me ? row.user_id_2 : row.user_id_1) as string);
			if (ids.length === 0) {
				if (active) setRows([]);
				return;
			}
			const [{ data: profiles }, online, ratings] = await Promise.all([
				supabase.from("profiles").select("auth_user_id, player_id, player_name").or(`auth_user_id.in.(${ids.join(",")}),player_id.in.(${ids.join(",")})`),
				fetchFriendsOnline(),
				fetchFriendChessRatings(),
			]);
			const names = new Map<string, string>();
			for (const profile of profiles ?? []) {
				if (profile.auth_user_id) names.set(profile.auth_user_id as string, profile.player_name as string);
				if (profile.player_id) names.set(profile.player_id as string, profile.player_name as string);
			}
			const list: Row[] = ids.map((id) => ({ id, name: names.get(id) || "?", online: online.has(id), ratings: ratings[id] ?? null }));
			list.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
			if (active) setRows(list);
		})();
		return () => {
			active = false;
		};
	}, []);

	return (
		<View style={local.screen}>
			<Text style={[local.label, { color: currentTheme.textSecondary }]}>{t("chess.friends")}</Text>
			{rows === null ? null : rows.length === 0 ? (
				<Text style={[local.hint, { color: currentTheme.textSecondary }]}>{t(signedIn ? "chess.noFriends" : "chess.signInForFriends")}</Text>
			) : (
				rows.map((row) => {
					const entry = row.ratings?.[control.timeClass] ?? null;
					const rating = String(entry?.rating ?? START_RATING);
					return (
						<View key={row.id} testID={`chess-friend-${row.id}`} style={[local.row, { borderColor: "rgba(255,255,255,0.18)", opacity: row.online ? 1 : 0.6 }]}>
							<View style={[local.dot, { backgroundColor: row.online ? "#2ECC40" : "#666" }]} />
							<View style={{ flex: 1 }}>
								<Text numberOfLines={1} style={[local.name, { color: currentTheme.textPrimary }]}>{row.name}</Text>
								<Text style={[local.tiny, { color: currentTheme.textSecondary }]}>{t(`chess.${control.timeClass}`)} {rating} · {t(row.online ? "chess.online" : "chess.offline")}</Text>
							</View>
							{row.online ? (
								<StylizedButton text={t("chess.challenge")} onClick={() => onChallenge({ id: row.id, name: row.name })} backgroundColor="#2E9E4F" style={local.small} textStyle={{ fontSize: 10 }} />
							) : null}
						</View>
					);
				})
			)}
			<StylizedButton text={t("chess.playWithCode")} onClick={onPlayWithCode} backgroundColor="#1E88E5" style={local.button} textStyle={{ fontSize: 12 }} />
			<StylizedButton text={t("chess.back")} onClick={onBack} backgroundColor={currentTheme.buttonSecondary} style={local.button} textStyle={{ fontSize: 12 }} />
		</View>
	);
}

const local = StyleSheet.create({
	screen: { width: "100%", maxWidth: 360, alignItems: "stretch", gap: 6 },
	label: { fontFamily: "Silkscreen", fontSize: 10, marginTop: 8, marginBottom: 2 },
	hint: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center", marginVertical: 14, lineHeight: 16 },
	row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderRadius: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.04)" },
	dot: { width: 10, height: 10, borderRadius: 5 },
	name: { fontFamily: "SilkscreenBold", fontSize: 12 },
	tiny: { fontFamily: "Silkscreen", fontSize: 9, marginTop: 2 },
	small: { minWidth: 84, height: 30, minHeight: 30, margin: 0, paddingHorizontal: 8 },
	button: { minWidth: 160, height: 38, minHeight: 38, margin: 0, marginTop: 8, alignSelf: "center" },
});
