import { MenuStateType, useAppState } from "@/hooks/useAppState";
import { StyleSheet, Text, View, TextInput, useWindowDimensions, ScrollView, ActivityIndicator } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { useState, useEffect } from "react";
import { useSoundSettings } from "@/constants/Sound";
import { useTheme } from "@/constants/Theme";
import { supabase } from "@/constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Session } from "@supabase/supabase-js";
import { useShopState } from "@/constants/Shop";
import { getPlayerElo } from "@/constants/Supabase";
import MatchHistoryList from "./MatchHistoryList";
import FriendsList from "./FriendsList";
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
	webClientId: '124810801663-q9dfh84aualkiqpmv5ae2f0kj08mig50.apps.googleusercontent.com',
});

const PLAYER_NAME_KEY = "PLAYER_NAME";
const PLAYER_ID_KEY = "PLAYER_ID";

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
	const [gamesPlayed, setGamesPlayed] = useState<number>(0);
	const [errorMessage, setErrorMessage] = useState("");
	const [authLoading, setAuthLoading] = useState(false);

	const { state: shopState } = useShopState();

	const loadProfileStats = async (name: string, userId: string) => {
		try {
			const elo = await getPlayerElo(name);
			if (elo !== null) setPlayerElo(elo);

			// Count games played from matchmaking_rooms where player participated and status is finished
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
	};

	useEffect(() => {
		supabase.auth.getSession().then(({ data: { session } }) => {
			setSession(session);
			setLoading(false);
			if (session) {
				AsyncStorage.getItem(PLAYER_NAME_KEY).then(name => {
					if (name) {
						setPlayerName(name);
						loadProfileStats(name, session.user.id);
					}
				});
			}
		});

		supabase.auth.onAuthStateChange((_event, session) => {
			setSession(session);
			if (session && playerName) {
				loadProfileStats(playerName, session.user.id);
			}
		});

		if (!session) {
			AsyncStorage.getItem(PLAYER_NAME_KEY).then(name => {
				if (name) setPlayerName(name);
			});
		}
	}, []);

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
				if (data.user) {
					await AsyncStorage.setItem(PLAYER_NAME_KEY, playerName);
					await AsyncStorage.setItem(PLAYER_ID_KEY, data.user.id);
					setErrorMessage("Success! Check your email to verify (if required), or you are logged in.");
				}
			} else {
				const { error, data } = await supabase.auth.signInWithPassword({
					email,
					password,
				});
				if (error) throw error;
				if (data.user) {
					// Load player name from profile
					const { data: profile } = await supabase.from('profiles').select('player_name').eq('id', data.user.id).single();
					if (profile?.player_name) {
						setPlayerName(profile.player_name);
						await AsyncStorage.setItem(PLAYER_NAME_KEY, profile.player_name);
					}
					await AsyncStorage.setItem(PLAYER_ID_KEY, data.user.id);
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
			await GoogleSignin.hasPlayServices();
			const userInfo = await GoogleSignin.signIn();
			if (userInfo.data?.idToken) {
				const { data, error } = await supabase.auth.signInWithIdToken({
					provider: 'google',
					token: userInfo.data.idToken,
				});
				if (error) throw error;
				if (data.user) {
					await AsyncStorage.setItem(PLAYER_ID_KEY, data.user.id);
					// Reload profile
					const { data: profile } = await supabase.from('profiles').select('player_name').eq('id', data.user.id).single();
					if (profile?.player_name) {
						setPlayerName(profile.player_name);
						await AsyncStorage.setItem(PLAYER_NAME_KEY, profile.player_name);
					}
				}
			}
		} catch (e: any) {
			console.error(e);
			setErrorMessage("Google Sign-In failed or was cancelled.");
		} finally {
			setAuthLoading(false);
		}
	};

	const handleLogout = async () => {
		playSfx('menuClick');
		setAuthLoading(true);
		await supabase.auth.signOut();
		await AsyncStorage.removeItem(PLAYER_ID_KEY);
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
					<View style={styles.profileContainer}>
						<View style={styles.avatarPlaceholder}>
							<Text style={styles.avatarText}>{playerName ? playerName.charAt(0).toUpperCase() : '?'}</Text>
						</View>
						<Text style={[styles.welcomeText, { color: currentTheme.textPrimary }]}>
							{playerName || session.user.email}
						</Text>

						<View style={styles.tabsContainer}>
							<StylizedButton 
								onClick={() => { playSfx('menuClick'); setActiveTab("stats"); }} 
								text="Stats" 
								backgroundColor={activeTab === "stats" ? currentTheme.buttonPrimary : currentTheme.buttonSecondary}
								style={styles.tabButton}
								textStyle={styles.tabButtonText}
							/>
							<StylizedButton 
								onClick={() => { playSfx('menuClick'); setActiveTab("history"); }} 
								text="History" 
								backgroundColor={activeTab === "history" ? currentTheme.buttonPrimary : currentTheme.buttonSecondary}
								style={styles.tabButton}
								textStyle={styles.tabButtonText}
							/>
							<StylizedButton 
								onClick={() => { playSfx('menuClick'); setActiveTab("friends"); }} 
								text="Friends" 
								backgroundColor={activeTab === "friends" ? currentTheme.buttonPrimary : currentTheme.buttonSecondary}
								style={styles.tabButton}
								textStyle={styles.tabButtonText}
							/>
						</View>
						
						{activeTab === "stats" && (
							<View style={styles.statsContainer}>
								<View style={[styles.statBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<Text style={[styles.statValue, { color: currentTheme.accent }]}>{shopState.balance}</Text>
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>Coins</Text>
								</View>
								<View style={[styles.statBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<Text style={[styles.statValue, { color: currentTheme.accent }]}>{playerElo !== null ? playerElo : "N/A"}</Text>
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>Elo</Text>
								</View>
								<View style={[styles.statBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
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
					<View style={styles.authContainer}>
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
							style={{ marginTop: 10, width: '100%' }}
						/>

						<StylizedButton 
							onClick={handleGoogleSignIn} 
							text="Sign in with Google" 
							backgroundColor="rgb(220, 70, 50)"
							style={{ marginTop: 10, width: '100%' }}
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
		fontFamily: 'SpaceMono',
	},
	errorText: {
		color: 'rgb(255, 100, 100)',
		fontFamily: 'SpaceMono',
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
});
