import { View, ScrollView, StyleSheet } from "react-native";

export default function SimplePopupView({children, style}: {children: any, style?: any[]}) {
	if (style === undefined)
		style = [];
    return (
		<View style={[styles.popupContainer, ...style]}>
			<ScrollView
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
		width: '81%',
		height: '71%',
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