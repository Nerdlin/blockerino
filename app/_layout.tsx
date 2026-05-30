import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { updateService } from "@/constants/UpdateService";

// Suppress warnings from third-party libraries
LogBox.ignoreLogs([
	'Support for defaultProps will be removed',
	'pointerEvents is deprecated',
	'`new NativeEventEmitter()` was called with a non-null argument'
]);

// Additional suppression for NativeEventEmitter warning
const originalWarn = console.warn;
console.warn = (...args) => {
	if (
		typeof args[0] === 'string' &&
		args[0].includes('new NativeEventEmitter')
	) {
		return;
	}
	originalWarn.apply(console, args);
};

export default function RootLayout() {
	useEffect(() => {
		// Check for updates on app startup
		updateService.checkForUpdates();
	}, []);

	return <Stack screenOptions={{headerShown: false, autoHideHomeIndicator: true}} />;
}
