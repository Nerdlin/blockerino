import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import StylizedButton from "./StylizedButton";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { track } from "@/constants/Analytics";
import { shareJoinLink, type JoinGame } from "@/constants/JoinLink";

/** Sends the room as a link (share sheet on a phone, share or clipboard in a browser): the friend taps it and joins. */
export default function ShareRoomButton({ game, code }: { game: JoinGame; code: string }) {
	const { t } = useLanguage();
	const { playSfx } = useSoundSettings();
	const [copied, setCopied] = useState(false);

	const share = async () => {
		playSfx("menuClick");
		const result = await shareJoinLink(game, code, t("mp.shareText"));
		track("room_share", { game, result });
		setCopied(result === "copied");
	};

	return (
		<>
			<StylizedButton text={t("mp.shareLink")} onClick={() => void share()} backgroundColor="#16A34A" style={styles.button} textStyle={styles.text} />
			{copied && <Animated.View entering={FadeIn.duration(200)}><Text style={styles.note}>{t("mp.linkCopied")}</Text></Animated.View>}
		</>
	);
}

const styles = StyleSheet.create({
	button: {
		minWidth: 220,
		marginTop: 10,
	},
	text: {
		fontSize: 14,
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		color: "#4ADE80",
		textAlign: "center",
		marginTop: 6,
	},
});
