import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { updateService } from "@/constants/UpdateService";

export default function RootLayout() {
	useEffect(() => {
		// Check for updates on app startup
		updateService.checkForUpdates();
	}, []);

	return <Stack screenOptions={{headerShown: false, autoHideHomeIndicator: true}} />;
}
