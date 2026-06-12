import { GameModeType, useAppState } from "@/hooks/useAppState";
import { Platform, StyleSheet, Text, View, TextInput, useWindowDimensions, ScrollView, ActivityIndicator } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSoundSettings } from "@/constants/Sound";
import { useTheme } from "@/constants/Theme";
import { supabase } from "@/constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Session, User } from "@supabase/supabase-js";
import { loadShopState, syncShopStateWithProfile, useShopState } from "@/constants/Shop";
import { PlayerProfile, getPlayerElo, getPlayerGlobalHighScore, upsertAuthenticatedProfile } from "@/constants/Supabase";
import { getHighScores, createHighScore } from "@/constants/Storage";
import MatchHistoryList from "./MatchHistoryList";
import FriendsList from "./FriendsList";
import { GoogleSignin } from '@react-native-google-signin/google-signin';

if (Platform.OS !== "web") {
	GoogleSignin.configure({
		webClientId: '124810801663-q9dfh84aualkiqpmv5ae2f0kj08mig50.apps.googleusercontent.com',
		scopes: ['profile', 'email'],
		offlineAccess: false,
	});
}

const PLAYER_NAME_KEY = "PLAYER_NAME";
const PLAYER_ID_KEY = "PLAYER_ID";
const WEB_AUTH_CALLBACK_PARAMS = [
	"code",
	"state",
	"access_token",
	"refresh_token",
	"expires_at",
	"expires_in",
	"token_type",
	"provider_token",
	"provider_refresh_token",
	"error",
	"error_code",
	"error_description",
];

function getSessionHydrationKey(nextSession: Session | null): string | null {
	return nextSession?.user?.id || null;
}

function getWebOAuthRedirectTo(): string {
	if (typeof window === "undefined") return "";
	const url = new URL(window.location.href);
	url.search = "";
	url.hash = "";
	return url.toString();
}

function readWebAuthCallbackMessage(): string | null {
	if (Platform.OS !== "web" || typeof window === "undefined") return null;

	const searchParams = new URLSearchParams(window.location.search);
	const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
	const errorDescription = searchParams.get("error_description") || hashParams.get("error_description");
	const error = searchParams.get("error") || hashParams.get("error");

	if (!error && !errorDescription) return null;

	const message = errorDescription || error || "Authentication callback failed.";
	if (message.toLowerCase().includes("oauth state parameter missing")) {
		return "Google sign-in callback expired or was opened twice. Please try again.";
	}
	return message;
}

function clearWebAuthCallbackParams() {
	if (Platform.OS !== "web" || typeof window === "undefined" || !window.history?.replaceState) return;

	const url = new URL(window.location.href);
	let changed = false;

	for (const param of WEB_AUTH_CALLBACK_PARAMS) {
		if (url.searchParams.has(param)) {
			url.searchParams.delete(param);
			changed = true;
		}
	}

	if (url.hash) {
		const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
		const hadAuthHash = WEB_AUTH_CALLBACK_PARAMS.some((param) => hashParams.has(param));
		if (hadAuthHash) {
			for (const param of WEB_AUTH_CALLBACK_PARAMS) {
				hashParams.delete(param);
			}
			const nextHash = hashParams.toString();
			url.hash = nextHash ? `#${nextHash}` : "";
			changed = true;
		}
	}

	if (changed) {
		window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
	}
}

export default function ProfileMenu() {
	const [ , , , popAppState ] = useAppState();
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const { playSfx } = useSoundSettings();
	const { currentTheme } = useTheme();

	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const [authMode, setAuthMode] = useState<"login" | "register">("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [playerName, setPlayerName] = useState("");
	const [playerElo, setPlayerElo] = useState<number | null>(null);
	const [classicScore, setClassicScore] = useState<number>(0);
	const [chaosScore, setChaosScore] = useState<number>(0);
	const [gamesPlayed, setGamesPlayed] = useState<number>(0);
	const [errorMessage, setErrorMessage] = useState("");
	const [authLoading, setAuthLoading] = useState(false);
	const hydratedSessionKeyRef = useRef<string | null>(null);
	const hydratingSessionKeyRef = useRef<string | null>(null);

	const { state: shopState, reload: reloadShopState } = useShopState();

	const loadProfileStats = useCallback(async (name: string, userId: string) => {
		try {
			const [
				elo,
				localClassicScores,
				localChaosScores,
				remoteClassicScore,
				remoteChaosScore,
			] = await Promise.all([
				getPlayerElo(name),
				getHighScores(GameModeType.Classic, true, true, 1),
				getHighScores(GameModeType.Chaos, true, true, 1),
				getPlayerGlobalHighScore(name, GameModeType.Classic),
				getPlayerGlobalHighScore(name, GameModeType.Chaos),
			]);
			if (elo !== null) setPlayerElo(elo);
			const localClassic = localClassicScores[0]?.score || 0;
			const remoteClassic = remoteClassicScore || 0;
			setClassicScore(Math.max(localClassic, remoteClassic));
			if (remoteClassic > localClassic) {
				await createHighScore({ score: remoteClassic, date: Date.now(), type: GameModeType.Classic });
			}

			const localChaos = localChaosScores[0]?.score || 0;
			const remoteChaos = remoteChaosScore || 0;
			setChaosScore(Math.max(localChaos, remoteChaos));
			if (remoteChaos > localChaos) {
				await createHighScore({ score: remoteChaos, date: Date.now(), type: GameModeType.Chaos });
			}

			const { count, error } = await supabase
				.from("matchmaking_rooms")
				.select("*", { count: "exact", head: true })
				.or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
				.eq("status", "finished");

			if (!error && count !== null) {
				setGamesPlayed(count);
			}
		} catch (e) {
			console.error("Error loading profile stats", e);
		}
	}, []);

	const applyProfile = useCallback(async (profile: PlayerProfile | null, user: User) => {
		const nextName = profile?.player_name || user.user_metadata?.player_name || user.user_metadata?.name || user.email?.split("@")[0] || "";
		if (nextName) {
			setPlayerName(nextName);
			await AsyncStorage.setItem(PLAYER_NAME_KEY, nextName);
		}
		await AsyncStorage.setItem(PLAYER_ID_KEY, user.id);
		const localShopState = await loadShopState();
		const syncResult = await syncShopStateWithProfile(localShopState);
		if (syncResult.status === "synced") {
			await reloadShopState();
		}
		await loadProfileStats(nextName, user.id);
	}, [loadProfileStats, reloadShopState]);

	const hydrateSession = useCallback(async (nextSession: Session | null, options: { force?: boolean } = {}) => {
		const sessionKey = getSessionHydrationKey(nextSession);
		setSession(nextSession);

		if (nextSession?.user) {
			if (
				!options.force &&
				sessionKey &&
				(hydratedSessionKeyRef.current === sessionKey || hydratingSessionKeyRef.current === sessionKey)
			) {
				return;
			}

			hydratingSessionKeyRef.current = sessionKey;
			const localName = await AsyncStorage.getItem(PLAYER_NAME_KEY);
			try {
				const profile = await upsertAuthenticatedProfile(nextSession.user, localName || undefined);
				await applyProfile(profile, nextSession.user);
				hydratedSessionKeyRef.current = sessionKey;
			} finally {
				if (hydratingSessionKeyRef.current === sessionKey) {
					hydratingSessionKeyRef.current = null;
				}
			}
		} else {
			hydratedSessionKeyRef.current = null;
			hydratingSessionKeyRef.current = null;
			const localName = await AsyncStorage.getItem(PLAYER_NAME_KEY);
			if (localName) setPlayerName(localName);
		}
	}, [applyProfile]);

	useEffect(() => {
		let mounted = true;
		const callbackMessage = readWebAuthCallbackMessage();
		if (callbackMessage) {
			setErrorMessage(callbackMessage);
			clearWebAuthCallbackParams();
		}

		supabase.auth.getSession().then(async ({ data: { session } }) => {
			await hydrateSession(session);
			if (mounted) setLoading(false);
		});

		const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
				setSession(session);
				return;
			}
			void hydrateSession(session, { force: event === "SIGNED_IN" });
		});

		return () => {
			mounted = false;
			listener.subscription.unsubscribe();
		};
	}, [hydrateSession]);

	const handleButtonPress = () => {
		playSfx('menuClick');
		popAppState();
	};

	useEscapeKey(handleButtonPress);

	const handleAuth = async () => {
		if (!email || !password) {
			setErrorMessage("Please fill all fields");
			return;
		}
		
		setAuthLoading(true);
		setErrorMessage("");
		playSfx('menuClick');

		try {
			if (authMode === "register") {
				if (!playerName) {
					setErrorMessage("Please enter a player name");
					setAuthLoading(false);
					return;
				}
				const { error, data } = await supabase.auth.signUp({
					email,
					password,
					options: {
						data: {
							player_name: playerName
						}
					}
				});
				if (error) throw error;
				if (data.session) {
					await hydrateSession(data.session, { force: true });
				} else if (data.user) {
					const profile = await upsertAuthenticatedProfile(data.user, playerName);
					await applyProfile(profile, data.user);
					setErrorMessage("Success! Check your email to verify (if required), or you are logged in.");
				}
			} else {
				const { error, data } = await supabase.auth.signInWithPassword({
					email,
					password,
				});
				if (error) throw error;
				if (data.session) {
					await hydrateSession(data.session, { force: true });
				} else if (data.user) {
					const profile = await upsertAuthenticatedProfile(data.user);
					await applyProfile(profile, data.user);
				}
			}
		} catch (e: any) {
			setErrorMessage(e.message || "Authentication failed");
		} finally {
			setAuthLoading(false);
		}
	};

	const handleGoogleSignIn = async () => {
		playSfx('menuClick');
		setAuthLoading(true);
		setErrorMessage("");
		try {
			if (Platform.OS === "web") {
				if (typeof window === "undefined") {
					throw new Error("Google OAuth is unavailable in this environment.");
				}
				clearWebAuthCallbackParams();
				const redirectTo = getWebOAuthRedirectTo();
				const { data, error } = await supabase.auth.signInWithOAuth({
					provider: "google",
					options: {
						redirectTo,
						scopes: "openid email profile",
						queryParams: { prompt: "select_account" },
						skipBrowserRedirect: true,
					},
				});
				if (error) throw error;
				if (!data.url) throw new Error("Google did not return a sign-in URL.");
				window.location.assign(data.url);
				return;
			}

			await GoogleSignin.hasPlayServices();
			const userInfo = await GoogleSignin.signIn();
			const idToken = userInfo.data?.idToken || (userInfo as any).idToken;
			if (idToken) {
				const { data, error } = await supabase.auth.signInWithIdToken({
					provider: 'google',
					token: idToken,
				});
				if (error) throw error;
				if (data.session) {
					await hydrateSession(data.session, { force: true });
				} else if (data.user) {
					const profile = await upsertAuthenticatedProfile(data.user);
					await applyProfile(profile, data.user);
				}
			} else {
				throw new Error("Google did not return an ID token. Check Android OAuth client SHA/package settings.");
			}
		} catch (e: any) {
			console.error(e);
			setErrorMessage(e.message || "Google Sign-In failed or was cancelled.");
		} finally {
			setAuthLoading(false);
		}
	};

	const handleLogout = async () => {
		playSfx('menuClick');
		setAuthLoading(true);
		await supabase.auth.signOut();
		await AsyncStorage.removeItem(PLAYER_ID_KEY);
		hydratedSessionKeyRef.current = null;
		hydratingSessionKeyRef.current = null;
		setSession(null);
		setAuthLoading(false);
	};

	const [activeTab, setActiveTab] = useState<"stats" | "history" | "friends">("stats");

	return (
		<SimplePopupView style={[
			{ backgroundColor: currentTheme.menuBackground },
			isMobile && { width: '92%', height: '85%', paddingHorizontal: 10 }
		]}>
			<Text style={[styles.sectionHeader, { color: currentTheme.textPrimary }]}>Profile</Text>
			
			<ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
				{loading ? (
					<ActivityIndicator size="large" color={currentTheme.accent} />
				) : session ? (
					<View style={[styles.profileContainer, isMobile && styles.mobileProfileContainer]}>
						<View style={styles.avatarPlaceholder}>
							<Text style={styles.avatarText}>{playerName ? playerName.charAt(0).toUpperCase() : '?'}</Text>
						</View>
						<Text style={[styles.welcomeText, { color: currentTheme.textPrimary }]}>
							{playerName || session.user.email}
						</Text>

						<View style={[styles.tabsContainer, isMobile && styles.mobileTabsContainer]}>
							<StylizedButton 
								onClick={() => { playSfx('menuClick'); setActiveTab("stats"); }} 
								text="Stats" 
								backgroundColor={activeTab === "stats" ? currentTheme.buttonPrimary : currentTheme.buttonSecondary}
								style={[styles.tabButton, isMobile && styles.mobileTabButton]}
								textStyle={[styles.tabButtonText, isMobile && styles.mobileTabButtonText]}
							/>
							<StylizedButton 
								onClick={() => { playSfx('menuClick'); setActiveTab("history"); }} 
								text="History" 
								backgroundColor={activeTab === "history" ? currentTheme.buttonPrimary : currentTheme.buttonSecondary}
								style={[styles.tabButton, isMobile && styles.mobileTabButton]}
								textStyle={[styles.tabButtonText, isMobile && styles.mobileTabButtonText]}
							/>
							<StylizedButton 
								onClick={() => { playSfx('menuClick'); setActiveTab("friends"); }} 
								text="Friends" 
								backgroundColor={activeTab === "friends" ? currentTheme.buttonPrimary : currentTheme.buttonSecondary}
								style={[styles.tabButton, isMobile && styles.mobileTabButton]}
								textStyle={[styles.tabButtonText, isMobile && styles.mobileTabButtonText]}
							/>
						</View>
						
						{activeTab === "stats" && (
							<View style={styles.statsContainer}>
								<View style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<Text style={[styles.statValue, { color: currentTheme.accent }]}>{shopState.balance}</Text>
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>Coins</Text>
								</View>
								<View style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<Text style={[styles.statValue, { color: currentTheme.accent }]}>{playerElo !== null ? playerElo : "N/A"}</Text>
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>Elo</Text>
								</View>
								<View style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<Text style={[styles.statValue, { color: currentTheme.accent }]}>{classicScore}</Text>
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>Classic</Text>
								</View>
								<View style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<Text style={[styles.statValue, { color: currentTheme.accent }]}>{chaosScore}</Text>
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>Chaos</Text>
								</View>
								<View style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<Text style={[styles.statValue, { color: currentTheme.accent }]}>{gamesPlayed}</Text>
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>Matches</Text>
								</View>
							</View>
						)}

						{activeTab === "history" && (
							<View style={styles.tabContentContainer}>
								<MatchHistoryList userId={session.user.id} />
							</View>
						)}

						{activeTab === "friends" && (
							<View style={styles.tabContentContainer}>
								<FriendsList userId={session.user.id} />
							</View>
						)}

						<StylizedButton 
							onClick={handleLogout} 
							text="Log Out" 
							backgroundColor="rgb(204, 51, 0)"
							style={{ marginTop: 20 }}
						/>
					</View>
				) : (
					<View style={[styles.authContainer, isMobile && styles.mobileAuthContainer]}>
						<Text style={[styles.authTitle, { color: currentTheme.textPrimary }]}>
							{authMode === "login" ? "Login to Sync" : "Create Account"}
						</Text>

						{authMode === "register" && (
							<TextInput
								style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
								placeholder="Player Name"
								placeholderTextColor={currentTheme.textSecondary}
								value={playerName}
								onChangeText={setPlayerName}
							/>
						)}

						<TextInput
							style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
							placeholder="Email"
							placeholderTextColor={currentTheme.textSecondary}
							value={email}
							onChangeText={setEmail}
							autoCapitalize="none"
							keyboardType="email-address"
						/>
						<TextInput
							style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
							placeholder="Password"
							placeholderTextColor={currentTheme.textSecondary}
							value={password}
							onChangeText={setPassword}
							secureTextEntry
						/>

						{errorMessage ? (
							<Text style={styles.errorText}>{errorMessage}</Text>
						) : null}

						<StylizedButton 
							onClick={handleAuth} 
							text={authLoading ? "..." : (authMode === "login" ? "Log In" : "Register")} 
							backgroundColor={currentTheme.buttonPrimary}
							style={[styles.authButton, isMobile && styles.mobileAuthButton]}
							textStyle={isMobile && styles.mobileAuthButtonText}
						/>

						<StylizedButton 
							onClick={handleGoogleSignIn} 
							text="Sign in with Google" 
							backgroundColor="rgb(220, 70, 50)"
							style={[styles.authButton, isMobile && styles.mobileAuthButton]}
							textStyle={isMobile && styles.mobileAuthButtonText}
						/>

						<StylizedButton 
							onClick={() => {
								playSfx('menuClick');
								setAuthMode(authMode === "login" ? "register" : "login");
								setErrorMessage("");
							}} 
							text={authMode === "login" ? "Need an account?" : "Already have an account?"} 
							backgroundColor="transparent"
							borderColor="transparent"
							textStyle={{ fontSize: 12, color: currentTheme.textSecondary }}
							style={{ marginTop: 5 }}
						/>
					</View>
				)}
			</ScrollView>

			<View style={styles.buttonsContainer}>
				<StylizedButton 
					onClick={handleButtonPress} 
					text="Back" 
					backgroundColor={currentTheme.buttonSecondary}
					style={isMobile && styles.mobileBottomButton}
					textStyle={isMobile && styles.mobileBottomButtonText}
				/>
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	sectionHeader: {
		fontSize: 24,
		fontFamily: 'Silkscreen',
		marginBottom: 20,
	},
	scrollContainer: {
		width: '100%',
		flex: 1,
	},
	scrollContent: {
		alignItems: 'center',
		paddingBottom: 20,
	},
	profileContainer: {
		width: '90%',
		alignItems: 'center',
	},
	mobileProfileContainer: {
		width: '100%',
	},
	welcomeText: {
		fontSize: 18,
		fontFamily: 'Silkscreen',
		marginBottom: 20,
		textAlign: 'center',
	},
	statsContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		width: '100%',
		gap: 15,
		flexWrap: 'wrap',
	},
	statBox: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: 15,
		borderWidth: 2,
		borderRadius: 8,
		minWidth: 100,
	},
	mobileStatBox: {
		minWidth: 130,
		paddingHorizontal: 10,
		paddingVertical: 12,
	},
	statValue: {
		fontSize: 24,
		fontFamily: 'SilkscreenBold',
		marginBottom: 5,
	},
	statLabel: {
		fontSize: 10,
		fontFamily: 'Silkscreen',
	},
	authContainer: {
		width: '90%',
		alignItems: 'center',
	},
	mobileAuthContainer: {
		width: '100%',
		paddingHorizontal: 2,
	},
	authTitle: {
		fontSize: 16,
		fontFamily: 'Silkscreen',
		marginBottom: 15,
	},
	input: {
		width: '100%',
		height: 45,
		borderWidth: 2,
		borderRadius: 4,
		paddingHorizontal: 10,
		marginBottom: 10,
		fontFamily: 'Silkscreen',
	},
	errorText: {
		color: 'rgb(255, 100, 100)',
		fontFamily: 'Silkscreen',
		fontSize: 12,
		marginBottom: 10,
		textAlign: 'center',
	},
	buttonsContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		width: '100%',
		gap: 6,
		marginTop: 20,
		paddingBottom: 20,
	},
	mobileBottomButton: {
		minWidth: 118,
		flexGrow: 1,
		flexBasis: 118,
		maxWidth: 150,
		paddingHorizontal: 8,
	},
	mobileBottomButtonText: {
		fontSize: 13,
	},
	avatarPlaceholder: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: '#444',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 10,
	},
	avatarText: {
		color: '#fff',
		fontSize: 24,
		fontFamily: 'SilkscreenBold',
	},
	tabsContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		width: '100%',
		gap: 10,
		marginBottom: 20,
		flexWrap: 'wrap',
	},
	tabButton: {
		flex: 1,
		paddingVertical: 8,
		minWidth: 105,
	},
	tabButtonText: {
		fontSize: 12,
	},
	mobileTabsContainer: {
		gap: 8,
	},
	mobileTabButton: {
		flexGrow: 1,
		flexBasis: 105,
		maxWidth: 160,
		minHeight: 38,
		paddingHorizontal: 6,
	},
	mobileTabButtonText: {
		fontSize: 11,
	},
	authButton: {
		marginTop: 10,
		width: '100%',
		minHeight: 54,
	},
	mobileAuthButton: {
		minHeight: 50,
		paddingHorizontal: 8,
	},
	mobileAuthButtonText: {
		fontSize: 13,
	},
	tabContentContainer: {
		width: '100%',
		minHeight: 200,
	},
});
