import { Stack } from "expo-router";
import Head from "expo-router/head";
import { useEffect } from "react";
import { AppState, LogBox, Platform, Text, View } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import { updateService } from "@/constants/UpdateService";
import { flushPendingVersusReports, flushPendingGlobalHighScores } from "@/constants/OfflineSync";
import { flushPendingSeasonScoresForSession } from "@/constants/SeasonScores";
import { useDiscordSDK } from "@/hooks/useDiscordSDK";
import { syncLocalHighScores } from "@/constants/LocalScoreSync";
import { startAnalytics } from "@/constants/Analytics";
import { startCrashReporting } from "@/constants/CrashReports";
import { setupNotifications } from "@/constants/Notifications";

// Suppress warnings from third-party libraries
LogBox.ignoreLogs([
	'Support for defaultProps will be removed',
	'pointerEvents is deprecated',
	'`new NativeEventEmitter()` was called with a non-null argument'
]);

const ignoredConsoleFragments = [
	'new NativeEventEmitter',
	'pointerEvents is deprecated',
	'props.pointerEvents is deprecated',
	'findDOMNode is deprecated'
];

const shouldIgnoreConsoleMessage = (args: unknown[]) => {
	const firstArg = args[0];
	return typeof firstArg === 'string' &&
		ignoredConsoleFragments.some((fragment) => firstArg.includes(fragment));
};

// Additional suppression for noisy third-party web/native warnings.
const originalWarn = console.warn;
console.warn = (...args) => {
	if (shouldIgnoreConsoleMessage(args)) {
		return;
	}
	originalWarn.apply(console, args);
};

const originalError = console.error;
console.error = (...args) => {
	if (shouldIgnoreConsoleMessage(args)) {
		return;
	}
	originalError.apply(console, args);
};

export default function RootLayout() {
	const { isReady, isEmbedded, error } = useDiscordSDK();

	useEffect(() => {
		// Check for updates on startup, whenever the app comes back to the foreground,
		// and every 30 minutes while it stays open, so a new release is announced.
		updateService.checkForUpdates();
		const updateAppStateSub = AppState.addEventListener('change', (nextState) => {
			if (nextState === 'active') updateService.checkForUpdates();
		});
		const updateTimer = setInterval(() => updateService.checkForUpdates(), 30 * 60 * 1000);

		let syncInProgress = false;
		const syncPendingScores = async () => {
			if (syncInProgress) return;
			syncInProgress = true;
			try {
				await syncLocalHighScores();
				await Promise.all([
					flushPendingGlobalHighScores(),
					flushPendingVersusReports(),
					flushPendingSeasonScoresForSession(),
				]);
			} catch (error) {
				console.error('Score sync failed; local records are preserved:', error);
			} finally {
				syncInProgress = false;
			}
		};

		syncPendingScores();
		const pendingScoreSyncTimer = setInterval(syncPendingScores, 15000);
		const stopAnalytics = startAnalytics();
		const stopCrashReporting = startCrashReporting();
		void setupNotifications();

		// Register service worker on web platform
		if (Platform.OS === 'web' && typeof window !== 'undefined' && navigator && 'serviceWorker' in navigator) {
			window.addEventListener('online', syncPendingScores);
			window.addEventListener('load', () => {
				const swPath = window.location.pathname.startsWith('/blockerino')
					? '/blockerino/service-worker.js'
					: '/service-worker.js';
				navigator.serviceWorker.register(swPath)
					.then((reg) => {
						console.log('Service Worker registered successfully with scope:', reg.scope);
					})
					.catch((err) => {
						console.error('Service Worker registration failed:', err);
					});
			});
		}

		return () => {
			updateAppStateSub.remove();
			stopAnalytics();
			stopCrashReporting();
			clearInterval(updateTimer);
			clearInterval(pendingScoreSyncTimer);
			if (Platform.OS === 'web' && typeof window !== 'undefined' && window.removeEventListener) {
				window.removeEventListener('online', syncPendingScores);
			}
		};
	}, []);

	if (isEmbedded && !isReady) {
		return <View style={{ flex: 1, backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }}><PixelLoader color="#FF335A" /></View>;
	}

	return (
		<>
			<Head>
				<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
				<link rel="manifest" href="manifest.json" />
				<title>Blockerino: pixel block puzzle with 1v1 duels</title>
				<meta name="description" content="Free pixel block puzzle. Clear rows and columns, beat the monthly leaderboards, duel friends 1v1 in real time, and play chess, Sea Battle, Durak and more. Android, browser and Discord." />
				<meta name="theme-color" content="#0D0B1A" />
				<meta property="og:type" content="website" />
				<meta property="og:site_name" content="Blockerino" />
				<meta property="og:title" content="Blockerino: pixel block puzzle with 1v1 duels" />
				<meta property="og:description" content="Clear rows and columns, climb the leaderboards and duel your friends in real time. Free, in your browser, on Android and in Discord." />
				<meta property="og:image" content="https://blockerino.aionerdlin.me/icon.png" />
				<meta name="twitter:card" content="summary" />
				<meta name="twitter:title" content="Blockerino: pixel block puzzle with 1v1 duels" />
				<meta name="twitter:description" content="Clear rows and columns, climb the leaderboards and duel your friends in real time." />
				<meta name="twitter:image" content="https://blockerino.aionerdlin.me/icon.png" />
				<meta name="mobile-web-app-capable" content="yes" />
				<style>{`
					html, body, #root {
						height: 100%;
						width: 100%;
						margin: 0;
						padding: 0;
						overflow: hidden;
						position: fixed;
						top: 0;
						left: 0;
					}
					
					body {
						touch-action: none;
						user-select: none;
						-webkit-user-select: none;
						overscroll-behavior: none;
					}

					::-webkit-scrollbar {
						width: 8px;
						height: 8px;
					}

					::-webkit-scrollbar-track {
						background: rgba(20, 20, 30, 0.6);
						border-radius: 4px;
					}

					::-webkit-scrollbar-thumb {
						background: linear-gradient(180deg, #555, #777);
						border-radius: 4px;
						border: 1px solid rgba(255, 255, 255, 0.08);
					}

					::-webkit-scrollbar-thumb:hover {
						background: linear-gradient(180deg, #777, #999);
					}

					::-webkit-scrollbar-thumb:active {
						background: linear-gradient(180deg, #888, #aaa);
					}

					* {
						scrollbar-width: thin;
						scrollbar-color: #666 rgba(20, 20, 30, 0.6);
					}
				`}</style>
			</Head>
			<Stack screenOptions={{headerShown: false, autoHideHomeIndicator: true}} />
			{error && (
				<View style={{ position: 'absolute', top: 50, left: 10, right: 10, backgroundColor: 'rgba(160,0,0,0.9)', padding: 10, zIndex: 9999, borderRadius: 8 }}>
					<Text style={{ color: 'white' }}>Discord: {error.message}</Text>
				</View>
			)}
		</>
	);
}
