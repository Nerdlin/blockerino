import { Pressable, StyleSheet, Text } from "react-native";
import { useSoundSettings } from "@/constants/Sound";

export default function StylizedButton({
    text, 
    onClick, 
    backgroundColor, 
    centered, 
    borderColor, 
    style,
    disabled
}: {
    text: string, 
    onClick?: () => any, 
    backgroundColor: string, 
    centered?: boolean, 
    borderColor?: string,
    style?: any,
    disabled?: boolean
}) {
    const { playSfx } = useSoundSettings();

    if (centered === undefined) {
        centered = true;
    }

    const handleHoverIn = () => {
        if (disabled) return;
        playSfx('buttonHover');
    };

    return (
        <Pressable 
            onPress={() => {
                if (!disabled && onClick) {
                    onClick();
                }
            }} 
            onHoverIn={handleHoverIn}
            style={[
                styles.stylizedButton, 
                {
                    backgroundColor, 
                    alignSelf: centered ? 'center' : 'flex-start', 
                    borderWidth: 2, 
                    borderColor: borderColor ? borderColor : "transparent",
                    opacity: disabled ? 0.5 : 1
                }, 
                style
            ]}
        >
            <Text style={styles.stylizedButtonText}>{text}</Text>
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
        fontWeight: '100',
        textAlign: 'center'
	}
});