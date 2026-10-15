import React from "react";
import { View, ScrollView, StyleSheet, useWindowDimensions } from "react-native";

// Phones keep the compact 480x760 card; big screens get a larger one so boards are not tiny.
export function getPopupLimits(width: number, height: number) {
	const desktop = width >= 900 && height >= 700;
	return desktop
		? { maxWidth: Math.min(760, Math.floor(width * 0.55)), maxHeight: Math.min(1040, Math.floor(height * 0.92)), height: "92%" as const }
		: { maxWidth: 480, maxHeight: 760, height: "80%" as const };
}

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
	if (style === undefined)
		style = [];
    return (
		<View style={[styles.popupContainer, getPopupLimits(width, height), ...style]}>
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
