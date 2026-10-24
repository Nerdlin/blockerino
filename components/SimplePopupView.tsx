import React, { createContext, useContext, useEffect, useRef } from "react";
import { Animated, Easing, View, ScrollView, StyleSheet, Platform, useWindowDimensions } from "react-native";

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
	footer,
}: {
	children: React.ReactNode,
	style?: any[],
	scrollRef?: React.RefObject<ScrollView | null>,
	/** Pinned under the scrolling content, so the main buttons stay in reach on long popups. */
	footer?: React.ReactNode,
}) {
	const { width, height } = useWindowDimensions();
	const scale = getPopupScale(width, height);
	// Every popup eases in: it fades up from a few pixels lower.
	const enter = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		Animated.timing(enter, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
	}, [enter]);
	if (style === undefined)
		style = [];
	// A screen that starts with a Back button asks for the top ("justifyContent: flex-start") instead of floating in the middle.
	const alignTop = StyleSheet.flatten(style)?.justifyContent === "flex-start";
    return (
		<UiScaleContext.Provider value={scale}>
		<Animated.View
			style={[
				styles.popupContainer,
				...style,
				{
					opacity: enter,
					transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, ...(scale > 1 ? [{ scale }] : [])],
				},
			]}
		>
			<ScrollView
				ref={scrollRef}
				style={footer ? styles.scrollViewWithFooter : styles.scrollView}
				contentContainerStyle={[styles.scrollContent, alignTop && { justifyContent: "flex-start" }]}
				showsVerticalScrollIndicator={true}
				keyboardShouldPersistTaps="handled"
				nestedScrollEnabled
			>
				{children}
			</ScrollView>
			{footer && <View style={styles.footer}>{footer}</View>}
		</Animated.View>
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
	scrollViewWithFooter: {
		width: '100%',
		flex: 1
	},
	footer: {
		width: '100%',
		alignItems: 'center',
		paddingVertical: 8,
		paddingHorizontal: 10,
		borderTopWidth: 1,
		borderTopColor: 'rgba(255, 255, 255, 0.18)'
	},
	scrollContent: {
		alignItems: 'center',
		justifyContent: 'center',
		flexGrow: 1,
		paddingVertical: 20,
		paddingHorizontal: 15
	}
});
