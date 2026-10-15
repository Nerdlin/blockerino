import React, { createContext, useContext } from "react";
import { View, ScrollView, StyleSheet, Platform, useWindowDimensions } from "react-native";

// On big web screens the whole popup card is scaled up as one piece, so every screen keeps its
// phone layout but nothing looks tiny. Returns 1 on phones and native.
export function getPopupScale(width: number, height: number): number {
	if (Platform.OS !== "web") return 1;
	const cardWidth = Math.min(width * 0.9, 480);
	const cardHeight = Math.min(height * 0.8, 760);
	const scale = Math.min((width * 0.92) / cardWidth, (height * 0.96) / cardHeight, 2.2);
	return scale > 1.05 ? Math.round(scale * 100) / 100 : 1;
}

// Drag handlers read this to turn screen-pixel gesture deltas into the card's own units.
export const UiScaleContext = createContext(1);
export const useUiScale = () => useContext(UiScaleContext);

export default function SimplePopupView({
	children,
	style,
	scrollRef,
}: {
	children: React.ReactNode,
	style?: any[],
	scrollRef?: React.RefObject<ScrollView | null>
}) {
	const { width, height } = useWindowDimensions();
	const scale = getPopupScale(width, height);
	if (style === undefined)
		style = [];
    return (
		<UiScaleContext.Provider value={scale}>
		<View style={[styles.popupContainer, ...style, scale > 1 && { transform: [{ scale }] }]}>
			<ScrollView
				ref={scrollRef}
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={true}
				keyboardShouldPersistTaps="handled"
				nestedScrollEnabled
			>
				{children}
			</ScrollView>
		</View>
		</UiScaleContext.Provider>
	);
}

const styles = StyleSheet.create({
	popupContainer: {
		width: '90%',
		height: '80%',
		maxWidth: 480,
		maxHeight: 760,
		backgroundColor: 'rgba(5, 5, 5, 0.95)',
		borderRadius: 20,
		borderColor: 'rgb(90, 90, 90)',
		borderWidth: 2,
		position: 'absolute',
		zIndex: 100,
		overflow: 'hidden'
	},
	scrollView: {
		width: '100%',
		height: '100%'
	},
	scrollContent: {
		alignItems: 'center',
		justifyContent: 'center',
		flexGrow: 1,
		paddingVertical: 20,
		paddingHorizontal: 15
	}
});
