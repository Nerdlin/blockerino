import { memo } from "react";
import PixelGlyphView from "@/components/PixelGlyphView";
import { UI_GLYPHS, type UiGlyphName } from "@/constants/UiGlyphs";

interface UiIconProps {
	name: UiGlyphName;
	/** Use a multiple of 9 so every pixel lands on the device pixel grid. */
	size?: number;
	dimmed?: boolean;
}

function UiIconComponent({ name, size = 18, dimmed = false }: UiIconProps) {
	return <PixelGlyphView glyph={UI_GLYPHS[name]} size={size} dimmed={dimmed} />;
}

export default memo(UiIconComponent);
