import { Pressable, StyleSheet, Text, View } from "react-native";
import { atom, useAtom } from "jotai";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { GameModeType } from "@/hooks/useAppState";

export interface IncomingInvite {
	hostName: string;
	mode: GameModeType;
	/** Replaces the default "invites you to a 1v1" line (chess challenges). */
	bodyText?: string;
	accept: () => void;
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

	const close = () => {
		void playSfx("menuClick");
		if (incoming) setIncoming(null);
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
