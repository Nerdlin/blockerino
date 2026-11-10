import { isFriendInDuel, outgoingInviteAtom } from "@/constants/OutgoingInvite";
import { sendInviteBroadcast } from "@/constants/InviteChannel";
import { useState } from "react";
import { Alert } from "react-native";
import { useSetAtom } from "jotai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/constants/Supabase";
import { notifyInvite } from "@/constants/Invites";
import { useLanguage } from "@/constants/Localization";
import { inviteModeRequestAtom } from "@/components/InviteModeHost";
import { GameModeType } from "@/hooks/useAppState";

// Invites a friend to a private 1v1 room: asks Classic or Chaos in the shared popup, creates the room, tells the
// friend (push when their app is closed, a live message when it is open) and then waits for the answer in
// InviteModeHost; the game starts only when the friend joins. A friend in a duel right now is not invited.
// Used by the friends list and by the friends strip of the Versus lobby.
export function useFriendInvite(userId: string) {
	const { t } = useLanguage();
	const askInviteMode = useSetAtom(inviteModeRequestAtom);
	const setOutgoingInvite = useSetAtom(outgoingInviteAtom);
	const [busy, setBusy] = useState(false);

	const sendInvite = async (friendId: string, friendName: string, gameMode: GameModeType) => {
		setBusy(true);

		if (await isFriendInDuel(friendId)) {
			Alert.alert(t("friends.inviteBusyTitle"), t("friends.inviteBusy", { name: friendName }));
			setBusy(false);
			return;
		}

		// 1. Create a private room
		const { data: profile } = await supabase
			.from("profiles")
			.select("player_name, elo")
			.or(`auth_user_id.eq.${userId},player_id.eq.${userId}`)
			.limit(1)
			.maybeSingle();
		const storedName = await AsyncStorage.getItem("PLAYER_NAME");
		const myName = profile?.player_name || storedName || "Player 1";
		const myElo = typeof profile?.elo === "number" ? profile.elo : 0;

		const { data: room, error } = await supabase.from("matchmaking_rooms").insert({
			player1_id: userId,
			player1_name: myName,
			status: "waiting",
			is_private: true,
			game_mode: gameMode,
		}).select().single();

		if (error || !room) {
			Alert.alert(t("friends.errorTitle"), t("friends.createRoomFailed"));
			setBusy(false);
			return;
		}

		void notifyInvite(room.id, friendId);

		// 2. Send the invitation to the friend's private inbox (and the old public one for older builds).
		const sendResult = (await sendInviteBroadcast(friendId, "1v1_invite", {
			roomId: room.id,
			hostName: myName,
			gameMode: gameMode,
		})) ? "ok" : "error";

		if (sendResult !== "ok") {
			await supabase.from("matchmaking_rooms").delete().eq("id", room.id).eq("status", "waiting");
			Alert.alert(t("friends.errorTitle"), t("friends.inviteSendFailed"));
			setBusy(false);
			return;
		}

		// 3. Wait for the answer; InviteModeHost enters the game as player1 once the friend has joined
		setOutgoingInvite({ roomId: room.id, friendId, friendName, mode: gameMode, myElo, sentAt: Date.now(), status: "waiting" });

		setBusy(false);
	};

	const inviteFriend = (friendId: string, friendName: string) => {
		if (busy) return;
		askInviteMode({ friendName, onPick: (mode) => void sendInvite(friendId, friendName, mode) });
	};

	return { inviteFriend, busy };
}
