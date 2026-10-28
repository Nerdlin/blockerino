import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "@/constants/Supabase";
import { fetchFriendsOnline } from "@/constants/Invites";
import { InviteGame, sendGameInvite } from "@/constants/GameInvite";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import StylizedButton from "../StylizedButton";

interface Row {
	id: string;
	name: string;
	online: boolean;
}

type Sent = "sent" | "failed";

/**
 * Under the room code of a waiting host: the signed-in player's friends, those online first, each with an invite
 * button. The friend gets a popup and joins this very room when they accept. Nothing is shown for a guest account.
 */
export function InviteFriendsPanel({ game, roomCode, hostName }: { game: InviteGame; roomCode: string; hostName: string }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [rows, setRows] = useState<Row[] | null>(null);
	const [sent, setSent] = useState<Record<string, Sent>>({});

	useEffect(() => {
		let active = true;
		void (async () => {
			const { data: session } = await supabase.auth.getSession();
			const me = session.session?.user?.id;
			if (!me) {
				if (active) setRows([]);
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
			const [{ data: profiles }, online] = await Promise.all([
				supabase.from("profiles").select("auth_user_id, player_id, player_name").or(`auth_user_id.in.(${ids.join(",")}),player_id.in.(${ids.join(",")})`),
				fetchFriendsOnline(),
			]);
			const names = new Map<string, string>();
			for (const profile of profiles ?? []) {
				if (profile.auth_user_id) names.set(profile.auth_user_id as string, profile.player_name as string);
				if (profile.player_id) names.set(profile.player_id as string, profile.player_name as string);
			}
			const list: Row[] = ids.map((id) => ({ id, name: names.get(id) || "?", online: online.has(id) }));
			list.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
			if (active) setRows(list);
		})();
		return () => {
			active = false;
		};
	}, []);

	const invite = async (row: Row) => {
		if (!roomCode) return;
		setSent((current) => ({ ...current, [row.id]: "sent" }));
		const ok = await sendGameInvite(row.id, { game, code: roomCode, hostName });
		if (!ok) setSent((current) => ({ ...current, [row.id]: "failed" }));
	};

	if (!rows || rows.length === 0) return null;
	return (
		<View style={local.panel}>
			<Text style={[local.label, { color: currentTheme.textSecondary }]}>{t("invite.friends")}</Text>
			{rows.map((row) => (
				<View key={row.id} testID={`invite-friend-${row.id}`} style={[local.row, { borderColor: "rgba(255,255,255,0.18)", opacity: row.online ? 1 : 0.55 }]}>
					<View style={[local.dot, { backgroundColor: row.online ? "#2ECC40" : "#666" }]} />
					<Text numberOfLines={1} style={[local.name, { color: currentTheme.textPrimary }]}>{row.name}</Text>
					{row.online ? (
						sent[row.id] === "sent" ? (
							<Text style={[local.state, { color: currentTheme.accent }]}>{t("invite.sent")}</Text>
						) : (
							<StylizedButton
								text={sent[row.id] === "failed" ? t("invite.retry") : t("invite.send")}
								onClick={() => void invite(row)}
								backgroundColor="#2E9E4F"
								style={local.small}
								textStyle={{ fontSize: 10 }}
							/>
						)
					) : (
						<Text style={[local.state, { color: currentTheme.textSecondary }]}>{t("chess.offline")}</Text>
					)}
				</View>
			))}
		</View>
	);
}

const local = StyleSheet.create({
	panel: { width: "100%", maxWidth: 360, alignItems: "stretch", gap: 6, marginTop: 8 },
	label: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center", marginBottom: 2 },
	row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderRadius: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.04)" },
	dot: { width: 10, height: 10, borderRadius: 5 },
	name: { flex: 1, fontFamily: "SilkscreenBold", fontSize: 12 },
	state: { fontFamily: "Silkscreen", fontSize: 9 },
	small: { minWidth: 84, height: 30, minHeight: 30, margin: 0, paddingHorizontal: 8 },
});
