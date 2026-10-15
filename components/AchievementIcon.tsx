import { memo, useMemo } from "react";
import PixelGlyphView, { buildGlyphPaths } from "@/components/PixelGlyphView";
import { ACHIEVEMENT_ICON_SIZE, getAchievementGlyph } from "@/constants/AchievementIcons";

export { buildGlyphPaths };

interface AchievementIconProps {
	achievementId: string;
	/** Use a multiple of 9 so every pixel lands on the device pixel grid. */
	size?: number;
	dimmed?: boolean;
}

function AchievementIconComponent({ achievementId, size = ACHIEVEMENT_ICON_SIZE * 3, dimmed = false }: AchievementIconProps) {
	const resolved = useMemo(() => getAchievementGlyph(achievementId), [achievementId]);

	if (!resolved) return null;

	return <PixelGlyphView glyph={resolved.glyph} palette={resolved.palette} size={size} dimmed={dimmed} />;
}

export default memo(AchievementIconComponent);
