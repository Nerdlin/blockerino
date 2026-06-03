import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";

export default function SimplePopupView({
	children,
	style,
	scrollRef,
}: {
	children: React.ReactNode,
	style?: any[],
	scrollRef?: React.RefObject<ScrollView | null>
}) {
	if (style === undefined)
		style = [];
    return (
		<View style={[styles.popupContainer, ...style]}>
			<ScrollView
				ref={scrollRef}
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={true}
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
