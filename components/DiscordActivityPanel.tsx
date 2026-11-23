import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { nameFontFamily } from "@/constants/NameFont";
import { gameAlert } from "@/constants/GameDialog";
import { track } from "@/constants/Analytics";
import { buildDiscordDuelInvite, DISCORD_DUEL_INVITE } from "@/constants/DiscordDuel";
import { sendDiscordDuelEvent } from "@/constants/DiscordDuelChannel";
import { getDiscordSelfId, type DiscordParticipant } from "@/constants/DiscordParticipants";
import { getDiscordGuildId, isDiscordSdkAvailable, openDiscordInviteDialog } from "@/hooks/useDiscordSDK";
import { useDiscordParticipants } from "@/hooks/useDiscordParticipants";
import { useFriendInvite, type InviteDelivery } from "@/hooks/useFriendInvite";
import StylizedButton from "./StylizedButton";

const MAX_SHOWN = 6;

/**
 * In a Discord Activity: who else is in the voice channel with the game, a one-tap duel challenge for each of them and the
 * "invite friends" button (Discord's own dialog). Shown at the top of the Versus lobby; renders nothing outside Discord.
 * The duel itself is the usual private room (see hooks/useFriendInvite.ts); only the delivery of the invitation differs.
 */
export default function DiscordActivityPanel({ userId }: { userId: string }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const people = useDiscordParticipants();
	const { inviteFriend, busy } = useFriendInvite(userId);
	const [inviting, setInviting] = useState(false);

	if (!isDiscordSdkAvailable()) return null;

	// Discord's invite dialog works in a server's voice channel only (not in a DM) and needs the right to create invites.
	const canInvite = getDiscordGuildId() !== null;

	const challenge = (person: DiscordParticipant) => {
		const selfId = getDiscordSelfId();
		if (!selfId) return;
		const deliver: InviteDelivery = async (room, myName, mode) => {
			const sent = await sendDiscordDuelEvent(DISCORD_DUEL_INVITE, buildDiscordDuelInvite(person.id, selfId, room.id, myName, mode));
			track("discord_duel_challenge", { sent });
			return sent;
		};
		inviteFriend(person.id, person.name, deliver);
	};

	const openInvite = async () => {
		if (inviting) return;
		setInviting(true);
		const opened = await openDiscordInviteDialog();
		track("discord_invite_dialog", { opened });
		if (!opened) gameAlert(t("discord.inviteTitle"), t("discord.inviteFailed"));
		setInviting(false);
	};

	return (
		<View style={styles.wrap}>
			<Text style={[styles.title, { color: currentTheme.textSecondary }]}>{t("discord.duelTitle")}</Text>
			{people.length === 0 ? (
				<Text style={[styles.empty, { color: currentTheme.textSecondary }]}>{t("discord.alone")}</Text>
			) : (
				people.slice(0, MAX_SHOWN).map((person) => (
					<View key={person.id} style={[styles.row, { borderColor: "rgba(255,255,255,0.14)" }]}>
						<View style={styles.avatar}>
							{person.avatarUrl ? (
								<Image source={{ uri: person.avatarUrl }} style={styles.avatarImage} />
							) : (
								<Text style={[styles.avatarText, { color: currentTheme.textPrimary }]}>{person.name.trim()[0]?.toUpperCase() || "?"}</Text>
							)}
						</View>
						<Text style={[styles.name, { color: currentTheme.textPrimary, fontFamily: nameFontFamily(person.name, "SilkscreenBold") }]} numberOfLines={1}>{person.name}</Text>
						<StylizedButton
							text={t("discord.challenge")}
							onClick={() => challenge(person)}
							backgroundColor={currentTheme.buttonPrimary}
							disabled={busy}
							style={styles.challenge}
							textStyle={styles.challengeText}
						/>
					</View>
				))
			)}
			{canInvite && (
				<StylizedButton
					text={t("discord.inviteFriends")}
					onClick={() => void openInvite()}
					disabled={inviting}
					backgroundColor="rgba(255,255,255,0.08)"
					borderColor="rgba(255,255,255,0.14)"
					style={styles.invite}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { width: "100%", marginTop: 14, gap: 6 },
	title: { fontFamily: "Silkscreen", fontSize: 11 },
	empty: { fontFamily: "Silkscreen", fontSize: 10, paddingVertical: 4 },
	row: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
	avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
	avatarImage: { width: "100%", height: "100%" },
	avatarText: { fontFamily: "SilkscreenBold", fontSize: 12 },
	name: { flex: 1, fontSize: 11 },
	challenge: { minWidth: 84, width: 84, minHeight: 26, height: 26, margin: 0, paddingHorizontal: 4 },
	challengeText: { fontSize: 9 },
	invite: { minHeight: 32, height: 32, margin: 0 },
});
