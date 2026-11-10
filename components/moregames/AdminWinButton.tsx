import StylizedButton from "../StylizedButton";
import { useAdminWinButton } from "@/constants/Admin";

// Admin testing tool: in a game against a bot, ends it as a win for the player at once. Shown only to the admin, and
// only after switching it on in the admin panel. Bot games are not rated, so nobody else is affected.
export function AdminWinButton({ onWin, disabled }: { onWin: () => void; disabled?: boolean }) {
	const [enabled] = useAdminWinButton();
	if (!enabled) return null;
	return (
		<StylizedButton
			text="Победа (админ)"
			onClick={onWin}
			disabled={disabled}
			backgroundColor="#7C3AED"
			style={{ height: 34, minWidth: 0, paddingHorizontal: 12, marginTop: 6 }}
			textStyle={{ fontSize: 11 }}
		/>
	);
}
