import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { fetchFriendsOnline } from "@/constants/Invites";
import { nameFontFamily } from "@/constants/NameFont";
import { useFriendInvite } from "@/hooks/useFriendInvite";
import StylizedButton from "./StylizedButton";

interface StripFriend {
	id: string;
	name: string;
}

const MAX_SHOWN = 4;

// Friends of a signed-in player at the top of the Versus lobby: who is online right now and a one-tap invite.
export default function VersusFriendsStrip({ userId }: { userId: string }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { inviteFriend, busy } = useFriendInvite(userId);
	const [friends, setFriends] = useState<StripFriend[]>([]);
	const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

	useEffect(() => {
		let active = true;
		(async () => {
			const { data } = await supabase
				.from("friends")
				.select("user_id_1, user_id_2, status")
				.or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
				.eq("status", "accepted");
			const ids = (data ?? []).map((row) => (row.user_id_1 === userId ? row.user_id_2 : row.user_id_1) as string);
			if (ids.length === 0) {
				if (active) setFriends([]);
				return;
			}
			const [{ data: byAuth }, { data: byPlayer }] = await Promise.all([
				supabase.from("profiles").select("auth_user_id, player_id, player_name").in("auth_user_id", ids),
				supabase.from("profiles").select("auth_user_id, player_id, player_name").in("player_id", ids),
			]);
			const names = new Map<string, string>();
			[...(byAuth ?? []), ...(byPlayer ?? [])].forEach((profile) => {
				if (profile.auth_user_id) names.set(profile.auth_user_id, profile.player_name);
				if (profile.player_id) names.set(profile.player_id, profile.player_name);
			});
			if (active) setFriends(ids.map((id) => ({ id, name: names.get(id) || "?" })));
		})();
		return () => { active = false; };
	}, [userId]);

	// Friends seen in the last two minutes count as online; asked again every 30 seconds while the lobby is open.
	useEffect(() => {
		let active = true;
		const refresh = () => void fetchFriendsOnline().then((ids) => { if (active) setOnlineIds(ids); });
		refresh();
		const timer = setInterval(refresh, 30000);
		return () => { active = false; clearInterval(timer); };
	}, []);

	if (friends.length === 0) return null;

	const shown = [...friends]
		.sort((a, b) => Number(onlineIds.has(b.id)) - Number(onlineIds.has(a.id)))
		.slice(0, MAX_SHOWN);

	return (
		<View style={styles.wrap}>
			<Text style={[styles.title, { color: currentTheme.textSecondary }]}>{t("mp.friendsOnline")}</Text>
			<View style={styles.row}>
				{shown.map((friend) => {
					const online = onlineIds.has(friend.id);
					return (
						<View key={friend.id} style={[styles.card, { borderColor: "rgba(255,255,255,0.18)", opacity: online ? 1 : 0.5 }]}>
							<View style={styles.avatar}>
								<Text style={[styles.avatarText, { color: currentTheme.textPrimary }]}>{friend.name.trim()[0]?.toUpperCase() ?? "?"}</Text>
								<View style={[styles.dot, { backgroundColor: online ? "#2ECC40" : "#666" }]} />
							</View>
							<Text style={[styles.name, { color: currentTheme.textPrimary, fontFamily: nameFontFamily(friend.name, "SilkscreenBold") }]} numberOfLines={1}>{friend.name}</Text>
							{online ? (
								<StylizedButton
									text={t("mp.invite")}
									onClick={() => inviteFriend(friend.id, friend.name)}
									backgroundColor={currentTheme.buttonPrimary}
									disabled={busy}
									style={styles.inviteButton}
									textStyle={styles.inviteText}
								/>
							) : (
								<Text style={[styles.offline, { color: currentTheme.textSecondary }]}>{t("mp.offline")}</Text>
							)}
						</View>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { width: "100%", marginTop: 14 },
	title: { fontFamily: "Silkscreen", fontSize: 11, marginBottom: 6 },
	row: { flexDirection: "row", gap: 6 },
	card: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4, alignItems: "center", gap: 4 },
	avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
	avatarText: { fontFamily: "SilkscreenBold", fontSize: 12 },
	dot: { position: "absolute", right: -2, bottom: -2, width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: "#0b0b10" },
	name: { fontSize: 10, maxWidth: "100%" },
	inviteButton: { minWidth: 0, width: "90%", minHeight: 26, height: 26, margin: 0, paddingHorizontal: 2 },
	inviteText: { fontSize: 9 },
	offline: { fontFamily: "Silkscreen", fontSize: 8, height: 26, textAlignVertical: "center", lineHeight: 26 },
});
