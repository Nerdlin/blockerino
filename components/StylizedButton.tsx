import { Platform, Pressable, StyleSheet, Text } from "react-native";
import { useSoundSettings } from "@/constants/Sound";

// Dark text on light fills: white text on bright yellow, cyan or green is hard to read. Returns undefined for colours it
// cannot read (names, transparent, translucent) so those keep the default white text.
export function readableTextColor(background: string | undefined): string | undefined {
    if (!background) return undefined;
    const value = background.trim().toLowerCase();
    let r: number, g: number, b: number;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
    } else {
        const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
        if (!rgb) return undefined;
        if (rgb[4] !== undefined && Number(rgb[4]) < 0.6) return undefined;
        r = Number(rgb[1]);
        g = Number(rgb[2]);
        b = Number(rgb[3]);
    }
    const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // Only really light fills (yellow, light blue, pale grey) get dark text. Mid tones such as red or orange keep white:
    // pure WCAG would turn them dark too, which reads worse with the pixel font and its shadow.
    return luminance > 0.42 ? "#111111" : undefined;
}

// The lower edge of a key: the fill, darker. Colours it cannot read get a plain dark edge.
export function darkerEdge(background: string | undefined): string {
    const value = (background ?? "").trim().toLowerCase();
    let r: number, g: number, b: number;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].split("").map((ch) => ch + ch).join("") : hex[1];
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
    } else {
        const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
        if (!rgb) return "rgba(0,0,0,0.45)";
        r = Number(rgb[1]);
        g = Number(rgb[2]);
        b = Number(rgb[3]);
    }
    return `rgb(${Math.round(r * 0.62)}, ${Math.round(g * 0.62)}, ${Math.round(b * 0.62)})`;
}

export default function StylizedButton({
    text, 
    onClick, 
    backgroundColor, 
    centered, 
    borderColor, 
    style,
    disabled,
    textStyle
}: {
    text: string, 
    onClick?: () => any, 
    backgroundColor: string, 
    centered?: boolean, 
    borderColor?: string,
    style?: any,
    disabled?: boolean,
    textStyle?: any
}) {
    const { playSfx } = useSoundSettings();

    if (centered === undefined) {
        centered = true;
    }

    const autoTextColor = readableTextColor(backgroundColor);

    const handleHoverIn = () => {
        if (disabled) return;
        if (Platform.OS === "web") return;
        playSfx('buttonHover');
    };

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={text}
            accessibilityState={{ disabled: Boolean(disabled) }}
            disabled={disabled} 
            hitSlop={disabled ? undefined : 6}
            onPress={() => {
                if (!disabled && onClick) {
                    onClick();
                }
            }} 
            onHoverIn={handleHoverIn}
            style={({ pressed }) => [
                styles.stylizedButton, 
                {
                    backgroundColor, 
                    alignSelf: centered ? 'center' : 'flex-start', 
                    borderWidth: 2, 
                    borderColor: borderColor ? borderColor : "transparent",
                    opacity: disabled ? 0.62 : 1
                }, 
                pressed && !disabled ? { transform: [{ translateY: 3 }], borderBottomWidth: 2, opacity: 0.95 } : null,
                style
            ]}
        >
            {/* one word never splits: it shrinks to fit the button; a phrase wraps between words */}
            <Text
                style={[styles.stylizedButtonText, autoTextColor ? { color: autoTextColor } : null, textStyle]}
                numberOfLines={/\s/.test(String(text).trim()) ? undefined : 1}
                adjustsFontSizeToFit={!/\s/.test(String(text).trim())}
                minimumFontScale={0.6}
                android_hyphenationFrequency="none"
            >{text}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
	stylizedButton: {
		minWidth: 160,
		minHeight: 38,
		paddingVertical: 6,
		paddingHorizontal: 16,
		borderRadius: 10,
		justifyContent: 'center',
		alignItems: 'center',
		margin: 4
	},
	stylizedButtonText: {
		fontSize: 18,
		color: 'white',
		fontFamily: 'Silkscreen',
        textAlign: 'center'
	}
});
