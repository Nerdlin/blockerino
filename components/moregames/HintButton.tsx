import { useState } from "react";
import { Text, View } from "react-native";
import StylizedButton from "../StylizedButton";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useShopState } from "@/constants/Shop";

/** What one hint costs, in coins. Hints exist only against a bot, where there is no one to cheat. */
export const HINT_COST = 20;
/** Chess against a bot: a hint is a strong engine move, so it costs more. */
export const CHESS_HINT_COST = 50;
/** Taking a move back against the chess bot: expensive on purpose, for a real blunder only. */
export const CHESS_UNDO_COST = 200;

// "Hint -20": takes the coins, then lets the game show its suggestion. Without enough coins it only says so.
// The same paid button also serves chess undo (label and cost passed in).
export function HintButton({ disabled, onHint, cost = HINT_COST, label, secondary }: { disabled: boolean; onHint: () => void; cost?: number; label?: string; secondary?: boolean }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { state, commit } = useShopState();
	const [poor, setPoor] = useState(false);

	const press = async () => {
		if (state.balance < cost) {
			setPoor(true);
			setTimeout(() => setPoor(false), 2200);
			return;
		}
		setPoor(false);
		await commit({ ...state, balance: state.balance - cost }, ["coins"]);
		onHint();
	};

	return (
		<View style={{ alignItems: "center", gap: 4, marginTop: 6 }}>
			<StylizedButton
				text={label ?? t("hint.button", { cost })}
				onClick={() => void press()}
				disabled={disabled}
				backgroundColor={secondary ? currentTheme.buttonSecondary : currentTheme.buttonPrimary}
				style={{ height: 36, minWidth: 0, paddingHorizontal: 12 }}
				textStyle={{ fontSize: 11 }}
			/>
			{poor && <Text style={{ fontFamily: "Silkscreen", fontSize: 10, color: "#F87171" }}>{t("hint.poor")}</Text>}
		</View>
	);
}
