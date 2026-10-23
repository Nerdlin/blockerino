import { useState } from "react";
import { Text, View } from "react-native";
import StylizedButton from "../StylizedButton";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useShopState } from "@/constants/Shop";

/** What one hint costs, in coins. Hints exist only against a bot, where there is no one to cheat. */
export const HINT_COST = 20;

// "Hint -20": takes the coins, then lets the game show its suggestion. Without enough coins it only says so.
export function HintButton({ disabled, onHint }: { disabled: boolean; onHint: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { state, commit } = useShopState();
	const [poor, setPoor] = useState(false);

	const press = async () => {
		if (state.balance < HINT_COST) {
			setPoor(true);
			setTimeout(() => setPoor(false), 2200);
			return;
		}
		setPoor(false);
		await commit({ ...state, balance: state.balance - HINT_COST }, ["coins"]);
		onHint();
	};

	return (
		<View style={{ alignItems: "center", gap: 4, marginTop: 6 }}>
			<StylizedButton
				text={t("hint.button", { cost: HINT_COST })}
				onClick={() => void press()}
				disabled={disabled}
				backgroundColor={currentTheme.buttonPrimary}
				style={{ height: 36, minWidth: 0, paddingHorizontal: 12 }}
				textStyle={{ fontSize: 11 }}
			/>
			{poor && <Text style={{ fontFamily: "Silkscreen", fontSize: 10, color: "#F87171" }}>{t("hint.poor")}</Text>}
		</View>
	);
}
