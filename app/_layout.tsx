import { Stack } from "expo-router";
import Head from "expo-router/head";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { updateService } from "@/constants/UpdateService";

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
	useEffect(() => {
		// Check for updates on app startup
		updateService.checkForUpdates();

		// Register service worker on web platform
		if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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
	}, []);

	return (
		<>
			<Head>
				<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
				<link rel="manifest" href="/manifest.json" />
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
		</>
	);
}
