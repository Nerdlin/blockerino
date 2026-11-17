import { Platform, Pressable, StyleSheet, Text } from "react-native";
import { useSoundSettings } from "@/constants/Sound";

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
                    opacity: disabled ? 0.5 : 1
                }, 
                pressed && !disabled ? { transform: [{ scale: 0.96 }], opacity: 0.88 } : null,
                style
            ]}
        >
            {/* one word never splits: it shrinks to fit the button; a phrase wraps between words */}
            <Text
                style={[styles.stylizedButtonText, textStyle]}
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
