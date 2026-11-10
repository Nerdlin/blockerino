import { INVITE_WAIT_MS, outgoingInviteAtom } from "@/constants/OutgoingInvite";
import { supabase } from "@/constants/Supabase";
import PixelLoader from "./PixelLoader";
import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { atom, useAtom } from "jotai";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { useEscapeKey } from "@/hooks/useEscapeKey";
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

export interface IncomingInvite {
	hostName: string;
	mode: GameModeType;
	/** Replaces the default "invites you to a 1v1" line (chess challenges). */
	bodyText?: string;
	accept: () => void;
	/** Tells the host the answer is "no" (so they stop waiting). */
	decline?: () => void;
}

/** Set by useInviteListener when a friend invites this player; the host below shows the answer buttons. */
export const incomingInviteAtom = atom<IncomingInvite | null>(null);

export interface InviteModeRequest {
	friendName: string;
	onPick: (mode: GameModeType) => void;
}

/** The friends list sets this; the host below asks which mode the 1v1 invite should be for. */
export const inviteModeRequestAtom = atom<InviteModeRequest | null>(null);

// A popup in the game's own style, drawn over whatever screen asked (the friends list sits inside the Profile popup,
// so it cannot draw a popup of its own).
export default function InviteModeHost() {
	const [request, setRequest] = useAtom(inviteModeRequestAtom);
	const [incoming, setIncoming] = useAtom(incomingInviteAtom);
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { playSfx } = useSoundSettings();

	const [outgoing, setOutgoing] = useAtom(outgoingInviteAtom);
	const setMultiplayerRoomId = useSetAtom(multiplayerRoomIdAtom);
	const setMultiplayerRole = useSetAtom(multiplayerRoleAtom);
	const setMultiplayerGameMode = useSetAtom(multiplayerGameModeAtom);
	const setMultiplayerOpponentName = useSetAtom(multiplayerOpponentNameAtom);
	const setMultiplayerPlayerElo = useSetAtom(multiplayerPlayerEloAtom);
	const [, setAppState] = useAppState();
	const outgoingRef = useRef(outgoing);
	outgoingRef.current = outgoing;

	// While an invite of ours waits, look at the room: the friend joining starts the game; no answer in time closes it.
	const waitingRoomId = outgoing?.status === "waiting" ? outgoing.roomId : null;
	useEffect(() => {
		if (!waitingRoomId) return;
		let stopped = false;
		const check = async () => {
			const current = outgoingRef.current;
			if (stopped || !current || current.roomId !== waitingRoomId || current.status !== "waiting") return;
			const { data: room } = await supabase.from("matchmaking_rooms").select("status, player2_id").eq("id", waitingRoomId).maybeSingle();
			if (stopped || outgoingRef.current?.roomId !== waitingRoomId) return;
			if (room?.status === "playing" && room.player2_id) {
				setMultiplayerRoomId(current.roomId);
				setMultiplayerRole("player1");
				setMultiplayerGameMode(current.mode);
				setMultiplayerOpponentName(current.friendName);
				setMultiplayerPlayerElo(current.myElo);
				setOutgoing(null);
				setAppState(MenuStateType.MULTIPLAYER_GAME);
				return;
			}
			if (!room) {
				setOutgoing({ ...current, status: "declined" });
				return;
			}
			if (Date.now() - current.sentAt > INVITE_WAIT_MS) {
				await supabase.from("matchmaking_rooms").delete().eq("id", current.roomId).eq("status", "waiting");
				setOutgoing({ ...current, status: "timeout" });
			}
		};
		const timer = setInterval(() => void check(), 1500);
		void check();
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	}, [waitingRoomId, setOutgoing, setAppState, setMultiplayerRoomId, setMultiplayerRole, setMultiplayerGameMode, setMultiplayerOpponentName, setMultiplayerPlayerElo]);

	const cancelOutgoing = () => {
		const current = outgoingRef.current;
		if (current?.status === "waiting") void supabase.from("matchmaking_rooms").delete().eq("id", current.roomId).eq("status", "waiting");
		setOutgoing(null);
	};

	const close = () => {
		void playSfx("menuClick");
		if (incoming) {
			incoming.decline?.();
			setIncoming(null);
		} else if (outgoingRef.current) cancelOutgoing();
		else setRequest(null);
	};
	useEscapeKey(close);

	if (incoming) {
		const modeName = incoming.mode === GameModeType.Chaos ? t("friends.modeChaos") : t("friends.modeClassic");
		return (
			<>
				<Pressable accessibilityLabel={t("invite.decline")} onPress={close} style={styles.scrim} />
				<SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground), height: "auto", maxHeight: 420 }]}>
					<View style={styles.column}>
						<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t("invite.title")}</Text>
						<Text style={[styles.name, { color: currentTheme.accent }]} numberOfLines={1}>
							{incoming.hostName}
						</Text>
						<Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{incoming.bodyText ?? t("invite.body", { mode: modeName })}</Text>
						<StylizedButton
							text={t("invite.accept")}
							onClick={() => {
								void playSfx("menuClick");
								const accept = incoming.accept;
								setIncoming(null);
								accept();
							}}
							backgroundColor="rgb(50,200,50)"
							style={styles.button}
						/>
						<StylizedButton text={t("invite.decline")} onClick={close} backgroundColor={currentTheme.buttonSecondary} style={styles.button} />
					</View>
				</SimplePopupView>
			</>
		);
	}

	if (outgoing && !request) {
		const text = outgoing.status === "waiting" ? t("friends.inviteWaiting")
			: outgoing.status === "busy" ? t("friends.inviteBusy", { name: outgoing.friendName })
			: outgoing.status === "declined" ? t("friends.inviteDeclined")
			: t("friends.inviteTimeout");
		return (
			<>
				<Pressable accessibilityLabel={t("friends.cancel")} onPress={close} style={styles.scrim} />
				<SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground), height: "auto", maxHeight: 420 }]}>
					<View style={styles.column}>
						<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t("friends.inviteTitle")}</Text>
						<Text style={[styles.name, { color: currentTheme.accent }]} numberOfLines={1}>
							{outgoing.friendName}
						</Text>
						{outgoing.status === "waiting" && <PixelLoader size="small" color={currentTheme.textPrimary} />}
						<Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{text}</Text>
						<StylizedButton
							text={outgoing.status === "waiting" ? t("friends.cancel") : t("friends.inviteOk")}
							onClick={close}
							backgroundColor={currentTheme.buttonSecondary}
							style={styles.button}
						/>
					</View>
				</SimplePopupView>
			</>
		);
	}

	if (!request) return null;

	const pick = (mode: GameModeType) => {
		void playSfx("menuClick");
		setRequest(null);
		request.onPick(mode);
	};

	return (
		<>
			<Pressable accessibilityLabel={t("friends.cancel")} onPress={close} style={styles.scrim} />
			<SimplePopupView
				style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground), height: "auto", maxHeight: 420 }]}
			>
				<View style={styles.column}>
					<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t("friends.inviteTitle")}</Text>
					<Text style={[styles.name, { color: currentTheme.accent }]} numberOfLines={1}>
						{request.friendName}
					</Text>
					<Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{t("friends.inviteHint")}</Text>
					<StylizedButton text={t("friends.modeClassic")} onClick={() => pick(GameModeType.Classic)} backgroundColor={currentTheme.buttonPrimary} style={styles.button} />
					<StylizedButton text={t("friends.modeChaos")} onClick={() => pick(GameModeType.Chaos)} backgroundColor="#7C3AED" style={styles.button} />
					<StylizedButton text={t("friends.cancel")} onClick={close} backgroundColor={currentTheme.buttonSecondary} style={styles.button} />
				</View>
			</SimplePopupView>
		</>
	);
}

const styles = StyleSheet.create({
	scrim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		// Same level as the popups; it comes after them in the tree, and the invite popup comes after it.
		zIndex: 100,
		backgroundColor: "rgba(4, 3, 10, 0.92)",
	},
	column: {
		width: "100%",
		alignItems: "center",
		gap: 10,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 18,
		textAlign: "center",
	},
	name: {
		fontFamily: "Silkscreen",
		fontSize: 20,
		maxWidth: "90%",
	},
	hint: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
		marginBottom: 6,
	},
	button: {
		minWidth: 220,
		margin: 0,
	},
});
