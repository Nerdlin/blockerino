import { Pressable, StyleSheet, Text } from "react-native";
import { useSoundSettings } from "@/constants/Sound";

export default function StylizedButton({
    text, 
    onClick, 
    backgroundColor, 
    centered, 
    borderColor, 
    style
}: {
    text: string, 
    onClick?: () => void, 
    backgroundColor: string, 
    centered?: boolean, 
    borderColor?: string,
    style?: any
}) {
    const { playSfx } = useSoundSettings();

    if (centered == undefined) {
        centered = true;
    }

    const handleHoverIn = () => {
        playSfx('buttonHover');
    };

    return (
        <Pressable 
            onPress={onClick} 
            onHoverIn={handleHoverIn}
            style={[
                styles.stylizedButton, 
                {
                    backgroundColor, 
                    alignSelf: centered ? 'center' : 'flex-start', 
                    borderWidth: 2, 
                    borderColor: borderColor ? borderColor : "transparent"
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
		width: 160,
		height: 30,
		borderRadius: 10,
		justifyContent: 'center',
		alignItems: 'center',
		margin: 4
	},
	stylizedButtonText: {
		fontSize: 18,
		color: 'white',
		fontFamily: 'Silkscreen',
        fontWeight: '100'
	}
});