import { useState } from "react";
import { Alert } from "react-native";
import { useSetAtom } from "jotai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/constants/Supabase";
import { notifyInvite } from "@/constants/Invites";
import { useLanguage } from "@/constants/Localization";
import { inviteModeRequestAtom } from "@/components/InviteModeHost";
import {
	GameModeType,
	MenuStateType,
	multiplayerGameModeAtom,
	multiplayerOpponentNameAtom,
	multiplayerPlayerEloAtom,
	multiplayerRoleAtom,
	multiplayerRoomIdAtom,
	useAppState,
} from "@/hooks/useAppState";

// Invites a friend to a private 1v1 room: asks Classic or Chaos in the shared popup, creates the room,
// tells the friend (push when their app is closed, a live message when it is open) and enters the game as host.
// Used by the friends list and by the friends strip of the Versus lobby.
export function useFriendInvite(userId: string) {
	const { t } = useLanguage();
	const askInviteMode = useSetAtom(inviteModeRequestAtom);
	const setMultiplayerRoomId = useSetAtom(multiplayerRoomIdAtom);
	const setMultiplayerRole = useSetAtom(multiplayerRoleAtom);
	const setMultiplayerGameMode = useSetAtom(multiplayerGameModeAtom);
	const setMultiplayerOpponentName = useSetAtom(multiplayerOpponentNameAtom);
	const setMultiplayerPlayerElo = useSetAtom(multiplayerPlayerEloAtom);
	const [, setAppState] = useAppState();
	const [busy, setBusy] = useState(false);

	const sendInvite = async (friendId: string, friendName: string, gameMode: GameModeType) => {
		setBusy(true);

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

		// 2. Broadcast invite to the friend after realtime is subscribed.
		const inviteChannel = supabase.channel(`invites:${friendId}`);
		const subscribed = await new Promise<boolean>((resolve) => {
			const timeout = setTimeout(() => resolve(false), 5000);
			inviteChannel.subscribe((status) => {
				if (status === "SUBSCRIBED") {
					clearTimeout(timeout);
					resolve(true);
				} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
					clearTimeout(timeout);
					resolve(false);
				}
			});
		});

		if (!subscribed) {
			await supabase.from("matchmaking_rooms").delete().eq("id", room.id).eq("status", "waiting");
			supabase.removeChannel(inviteChannel);
			Alert.alert(t("friends.errorTitle"), t("friends.realtimeFailed"));
			setBusy(false);
			return;
		}

		const sendResult = await inviteChannel.send({
			type: "broadcast",
			event: "1v1_invite",
			payload: {
				roomId: room.id,
				hostName: myName,
				gameMode: gameMode,
			},
		});
		supabase.removeChannel(inviteChannel);

		if (sendResult !== "ok") {
			await supabase.from("matchmaking_rooms").delete().eq("id", room.id).eq("status", "waiting");
			Alert.alert(t("friends.errorTitle"), t("friends.inviteSendFailed"));
			setBusy(false);
			return;
		}

		// 3. Join the room as player1
		setMultiplayerRoomId(room.id);
		setMultiplayerRole("player1");
		setMultiplayerGameMode(gameMode);
		setMultiplayerOpponentName(friendName);
		setMultiplayerPlayerElo(myElo);
		setAppState(MenuStateType.MULTIPLAYER_GAME);

		setBusy(false);
	};

	const inviteFriend = (friendId: string, friendName: string) => {
		if (busy) return;
		askInviteMode({ friendName, onPick: (mode) => void sendInvite(friendId, friendName, mode) });
	};

	return { inviteFriend, busy };
}
