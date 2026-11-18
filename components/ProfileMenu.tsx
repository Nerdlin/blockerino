import { GameModeType, useAppState } from "@/hooks/useAppState";
import AnimatedNumber from "./AnimatedNumber";
import { useSetAtom } from "jotai";
import { deleteAccountOpenAtom } from "./AccountDeleteHost";
import FadeInView from "./FadeInView";
import { track } from "@/constants/Analytics";
import { Platform, StyleSheet, Text, View, TextInput, useWindowDimensions, ScrollView, Image, Pressable } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import SegmentedControl from "./SegmentedControl";
import PerkBadge from "./PerkBadge";
import SeasonTitleBadges from "./SeasonTitleBadges";
import { getMySeasonTitles, type SeasonTitle } from "@/constants/SeasonResults";
import { useLeaderboardPerk } from "@/constants/LeaderboardPerks";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSoundSettings } from "@/constants/Sound";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { emailConfirmRedirect, passwordResetRedirect } from "@/constants/EmailConfirm";
import GiftChestsPanel from "./GiftChestsPanel";
import { badgeLabel, useProfileBadge } from "@/constants/ProfileBadge";
import { supabase, renamePlayer } from "@/constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PixelIcon from "@/components/PixelIcon";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Session, User } from "@supabase/supabase-js";
import { createDefaultShopState, loadShopState, saveShopState, syncShopStateWithProfile, useShopState } from "@/constants/Shop";
import { PlayerProfile, getPlayerElo, getPlayerGlobalHighScore, upsertAuthenticatedProfile, updateProfileAvatar } from "@/constants/Supabase";
import { getHighScores, createHighScore } from "@/constants/Storage";
import { pickAndUploadAvatar, removeAvatarFiles } from "@/constants/AvatarUpload";
import { consumeProfileAuthIntent } from "@/constants/ProfileIntent";
import MatchHistoryList from "./MatchHistoryList";
import FriendsList from "./FriendsList";
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { isDiscordActivityLocation } from "@/constants/DiscordEnvironment";
import { signInWithDiscordNative } from "@/constants/DiscordNativeAuth";
import { getAccountSession, accountSessionOf } from '@/constants/AccountSession';

// Inside a Discord Activity the page may not navigate to other sites (Discord ends the activity),
// so the OAuth redirects to Google / Discord cannot be used there.
const IN_DISCORD_ACTIVITY = Platform.OS === "web" && typeof window !== "undefined" && !!window.location
	&& isDiscordActivityLocation(window.location.hostname, window.location.search);

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
	const { t, language } = useLanguage();

	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const [authMode, setAuthMode] = useState<"login" | "register">(() => consumeProfileAuthIntent() ?? "login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	// The email of a sign-up that still waits for the letter's link. Until then there is no account to show:
	// the form stays, says so, and offers to send the letter again.
	const [pendingEmail, setPendingEmail] = useState<string | null>(null);
	// a guest with a name sees their local profile; "Sign in" there opens the form
	const [showAuth, setShowAuth] = useState(false);
	const [resendNote, setResendNote] = useState<string | null>(null);
	const [resetMode, setResetMode] = useState(false);
	const [resetNote, setResetNote] = useState<string | null>(null);
	const [playerName, setPlayerName] = useState("");
	// A guest's name is changed here and nowhere else (More Games, high scores and Versus only show it).
	const [editingName, setEditingName] = useState(false);
	const [nameDraft, setNameDraft] = useState("");
	const [nameError, setNameError] = useState<string | null>(null);
	const saveName = useCallback(async () => {
		setEditingName(false);
		const next = nameDraft.trim().slice(0, 20);
		if (!next || next === playerName) return;
		if (!session) {
			// a guest's name lives on this device only
			setPlayerName(next);
			void AsyncStorage.setItem(PLAYER_NAME_KEY, next);
			return;
		}
		// an account's name is changed by the server: it checks the form, that the name is free and the 30-day limit
		const result = await renamePlayer(next);
		if (result.status === "ok" && result.name) {
			setNameError(null);
			setPlayerName(result.name);
			void AsyncStorage.setItem(PLAYER_NAME_KEY, result.name);
		} else if (result.status === "cooldown") {
			setNameError(t("profile.rename.cooldown", { date: result.nextAt ? new Date(result.nextAt).toLocaleDateString() : "" }));
		} else if (result.status === "taken" || result.status === "invalid") {
			setNameError(t(`profile.rename.${result.status}`));
		} else {
			setNameError(t("profile.rename.failed"));
		}
	}, [nameDraft, playerName, session, t]);
	// What is typed into the registration form. It must not be playerName itself: a non-empty playerName switches the
	// screen from the form to the profile view, which made the form vanish on the first typed letter.
	const [registerName, setRegisterName] = useState("");
	const perk = useLeaderboardPerk(playerName);
	const [seasonTitles, setSeasonTitles] = useState<SeasonTitle[]>([]);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [showAvatarPopup, setShowAvatarPopup] = useState(false);
	const [avatarUploading, setAvatarUploading] = useState(false);
	const [avatarUploadFailed, setAvatarUploadFailed] = useState(false);
	const [playerElo, setPlayerElo] = useState<number | null>(null);
	const [classicScore, setClassicScore] = useState<number>(0);
	const [chaosScore, setChaosScore] = useState<number>(0);
	const [gamesPlayed, setGamesPlayed] = useState<number>(0);
	const [errorMessage, setErrorMessage] = useState("");
	const [authLoading, setAuthLoading] = useState(false);
	const hydratedSessionKeyRef = useRef<string | null>(null);
	const hydratingSessionKeyRef = useRef<string | null>(null);

	const sessionUserId = session?.user.id;
	useEffect(() => {
		if (!sessionUserId) {
			setSeasonTitles([]);
			return;
		}
		let cancelled = false;
		getMySeasonTitles(6).then((titles) => {
			if (!cancelled) setSeasonTitles(titles);
		});
		return () => {
			cancelled = true;
		};
	}, [sessionUserId]);

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

			// history rows plus the offset an admin may set (player_matches); the plain count where the server lacks it
			const matches = await supabase.rpc("player_matches", { p_user: userId });
			if (!matches.error && typeof matches.data === "number") {
				setGamesPlayed(matches.data);
			} else {
				const { count, error } = await supabase
					.from("match_history")
					.select("*", { count: "exact", head: true })
					.or(`player1_id.eq.${userId},player2_id.eq.${userId}`);
				if (!error && count !== null) setGamesPlayed(count);
			}
		} catch (e) {
			console.error("Error loading profile stats", e);
		}
	}, []);

	const applyProfile = useCallback(async (profile: PlayerProfile | null, user: User) => {
		const nextName = profile?.player_name || user.user_metadata?.player_name || user.user_metadata?.name || user.email?.split("@")[0] || "";
		const nextAvatar = profile?.avatar_url || user.user_metadata?.avatar_url || null;
		setAvatarUrl(nextAvatar);
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

		getAccountSession().then(async ({ data: { session } }) => {
			if (mounted) {
				await hydrateSession(session, { force: true });
				setLoading(false);
			}
		});

		const { data: listener } = supabase.auth.onAuthStateChange((event, rawSession) => {
			const session = accountSessionOf(rawSession);
			if (mounted) {
				setSession(session);
				if (session?.user) {
					void hydrateSession(session, { force: true });
				}
			}
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
			setErrorMessage(t("profile.fillAllFields"));
			return;
		}
		
		setAuthLoading(true);
		setErrorMessage("");
		playSfx('menuClick');

		try {
			if (authMode === "register") {
				const chosenName = registerName.trim();
				if (!chosenName) {
					setErrorMessage(t("profile.enterPlayerName"));
					setAuthLoading(false);
					return;
				}
				const { error, data } = await supabase.auth.signUp({
					email,
					password,
					options: {
						// the letter's link lands on a page that says "confirmed" and leads back to where the player plays
						emailRedirectTo: emailConfirmRedirect(language),
						data: {
							player_name: chosenName,
							// picks the language of the letter (docs/email/confirm-signup.html)
							lang: language === "ru" ? "ru" : "en"
						}
					}
				});
				if (error) throw error;
				track("signup");
				if (data.session) {
					await hydrateSession(data.session, { force: true });
				} else if (data.user) {
					// no session yet: the email has to be confirmed first, then the player signs in
					setPendingEmail(email);
					setResendNote(null);
					setAuthMode("login");
					setErrorMessage("");
				}
			} else {
				const { error, data } = await supabase.auth.signInWithPassword({
					email,
					password,
				});
				if (error) {
					if (/not confirmed/i.test(error.message)) {
						setPendingEmail(email);
						setErrorMessage(t("profile.confirmFirst"));
						return;
					}
					throw error;
				}
				setPendingEmail(null);
				track("login", { method: "password" });
				if (data.session) {
					await hydrateSession(data.session, { force: true });
				} else if (data.user) {
					const profile = await upsertAuthenticatedProfile(data.user);
					await applyProfile(profile, data.user);
				}
			}
		} catch (e: any) {
			setErrorMessage(e.message || t("profile.authFailed"));
		} finally {
			setAuthLoading(false);
		}
	};

	// Forgotten password: the letter's link goes through the same landing page as the sign-up confirmation.
	const handlePasswordReset = async () => {
		const address = email.trim();
		if (!address) {
			setErrorMessage(t("profile.fillAllFields"));
			return;
		}
		playSfx('menuClick');
		setAuthLoading(true);
		setErrorMessage("");
		setResetNote(null);
		const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: passwordResetRedirect(language) });
		setAuthLoading(false);
		if (error) setErrorMessage(error.message || t("profile.authFailed"));
		else setResetNote(t("profile.resetSent", { email: address }));
	};

	const resendConfirmation = async () => {
		if (!pendingEmail || authLoading) return;
		playSfx('menuClick');
		setAuthLoading(true);
		const { error } = await supabase.auth.resend({
			type: "signup",
			email: pendingEmail,
			options: { emailRedirectTo: emailConfirmRedirect(language) },
		});
		setAuthLoading(false);
		setResendNote(t(error ? "profile.confirmResendFailed" : "profile.confirmResent"));
	};

	const handleGoogleSignIn = async () => {
		playSfx('menuClick');
		setAuthLoading(true);
		setErrorMessage("");
		try {
			if (Platform.OS === "web") {
				if (typeof window === "undefined") {
					throw new Error(t("profile.googleUnavailable"));
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
				if (!data.url) throw new Error(t("profile.googleNoUrl"));
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
				throw new Error(t("profile.googleNoToken"));
			}
		} catch (e: any) {
			console.error(e);
			setErrorMessage(e.message || t("profile.googleFailed"));
		} finally {
			setAuthLoading(false);
		}
	};

	const handleDiscordSignIn = async () => {
		playSfx('menuClick');
		setAuthLoading(true);
		setErrorMessage("");
		try {
			if (Platform.OS === "web") {
				if (typeof window === "undefined") return;
				clearWebAuthCallbackParams();
				const redirectTo = getWebOAuthRedirectTo();
				const { data, error } = await supabase.auth.signInWithOAuth({
					provider: "discord",
					options: {
						redirectTo,
						skipBrowserRedirect: true,
					},
				});
				if (error) throw error;
				if (!data.url) throw new Error("Could not get Discord auth URL");
				window.location.assign(data.url);
				return;
			}
			// Android: same account as the Discord Activity (see constants/DiscordNativeAuth.ts).
			const result = await signInWithDiscordNative();
			if (result.status === "error") throw new Error(result.message);
			if (result.status === "signed_in") {
				const { data: { user } } = await supabase.auth.getUser();
				if (user) {
					const profile = await upsertAuthenticatedProfile(user);
					await applyProfile(profile, user);
				}
			}
		} catch (e: any) {
			console.error(e);
			setErrorMessage(e.message || "Discord Sign-In failed.");
		} finally {
			setAuthLoading(false);
		}
	};

	const setDeleteAccountOpen = useSetAtom(deleteAccountOpenAtom);

	const handleLogout = async () => {
		playSfx('menuClick');
		setAuthLoading(true);
		// The wallet on the device is the account's: push what is not saved yet, and after signing out start a clean
		// one, so the next account made on this device does not inherit the coins of the previous one.
		try {
			await syncShopStateWithProfile(await loadShopState());
		} catch {
			// offline: what was not synced stays on the server as it was
		}
		await supabase.auth.signOut();
		await saveShopState(createDefaultShopState());
		await reloadShopState();
		track("logout");
		await AsyncStorage.removeItem(PLAYER_ID_KEY);
		await AsyncStorage.removeItem(PLAYER_NAME_KEY);
		hydratedSessionKeyRef.current = null;
		hydratingSessionKeyRef.current = null;
		setSession(null);
		setPlayerName("");
		setAvatarUrl(null);
		setAuthLoading(false);
	};

	const [activeTab, setActiveTab] = useState<"stats" | "gifts" | "history" | "friends">("stats");
	const { badge, refresh: refreshBadge } = useProfileBadge();

	return (
		<>
			<SimplePopupView style={[
				{ backgroundColor: currentTheme.menuBackground },
			isMobile && { width: '92%', height: '85%', paddingHorizontal: 10 }
		]}>
			<View style={styles.topBar}>
				<StylizedButton
					onClick={handleButtonPress}
					text={t("profile.back")}
					backgroundColor={currentTheme.buttonSecondary}
					style={styles.topBackButton}
					textStyle={{ fontSize: 12 }}
				/>
				<Text style={[styles.sectionHeader, { color: currentTheme.textPrimary }]}>{t("profile.title")}</Text>
				<View style={styles.topBackButton} />
			</View>
			
			<ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
				{loading ? (
					<PixelLoader size="large" color={currentTheme.accent} />
				) : (session || (playerName && !showAuth)) ? (
					<View style={[styles.profileContainer, isMobile && styles.mobileProfileContainer]}>
						<FadeInView pop>
						<Pressable onPress={() => setShowAvatarPopup(true)} style={{ position: "relative" }}>
							{avatarUrl && avatarUrl.startsWith("http") ? (
								<Image source={{ uri: avatarUrl }} style={[styles.avatarPlaceholder, { backgroundColor: "transparent" }]} />
							) : (
								<View style={styles.avatarPlaceholder}>
									<Text style={styles.avatarText}>{avatarUrl || (playerName ? playerName.charAt(0).toUpperCase() : '?')}</Text>
								</View>
							)}
							<View style={styles.editAvatarBadge}><PixelIcon name="pencil" size={14} color="#F0AF0C" secondaryColor="#F472B6" /></View>
						</Pressable>
						</FadeInView>
						{editingName ? (
							<TextInput
								testID="profile-name-input"
								autoFocus
								value={nameDraft}
								onChangeText={setNameDraft}
								onBlur={() => void saveName()}
								onSubmitEditing={() => void saveName()}
								maxLength={20}
								placeholder={t("profile.playerNamePlaceholder")}
								placeholderTextColor={currentTheme.textSecondary}
								style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder, textAlign: "center", maxWidth: 260 }]}
							/>
						) : (
							<Pressable
								testID="profile-name"
								onPress={() => { setNameDraft(playerName); setNameError(null); setEditingName(true); }}
								style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
							>
								<Text style={[styles.welcomeText, { color: perk?.tier.color ?? currentTheme.textPrimary }]}>
									{playerName || session?.user.email}
								</Text>
								<PixelIcon name="pencil" size={16} color="#F0AF0C" secondaryColor="#F472B6" />
							</Pressable>
						)}
						{nameError ? <Text style={[styles.errorText, { textAlign: "center" }]}>{nameError}</Text> : (editingName && session ? <Text style={{ color: currentTheme.textSecondary, fontSize: 11, textAlign: "center" }}>{t("profile.rename.hint")}</Text> : null)}
						{perk && <PerkBadge perk={perk} />}
						<SeasonTitleBadges titles={seasonTitles} />

						<SegmentedControl
							small
							items={[
								{ key: "stats", label: t("profile.tabStats") },
								{ key: "gifts", label: badge.giftChests > 0 ? `${t("profile.tabGifts")} (${badgeLabel(badge.giftChests)})` : t("profile.tabGifts") },
								{ key: "history", label: t("profile.tabHistory") },
								{ key: "friends", label: badge.friendRequests > 0 ? `${t("profile.tabFriends")} (${badgeLabel(badge.friendRequests)})` : t("profile.tabFriends") },
							]}
							value={activeTab}
							onChange={(tab) => { playSfx('menuClick'); setActiveTab(tab); void refreshBadge(); }}
						/>
						<View style={{ height: 12 }} />

						{activeTab === "gifts" && (
							<FadeInView key="gifts" style={styles.tabContentContainer}>
								{session ? <GiftChestsPanel /> : <Text style={{ color: currentTheme.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 12 }}>{t("chest.needAccount")}</Text>}
							</FadeInView>
						)}

						{activeTab === "stats" && (
							<View style={styles.statsContainer}>
								<FadeInView index={0} style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<AnimatedNumber value={shopState.balance} style={[styles.statValue, { color: currentTheme.accent }]} />
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>{t("profile.coins")}</Text>
								</FadeInView>
								<FadeInView index={1} style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									{playerElo !== null ? <AnimatedNumber value={playerElo} style={[styles.statValue, { color: currentTheme.accent }]} /> : <Text style={[styles.statValue, { color: currentTheme.accent }]}>N/A</Text>}
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>{t("profile.elo")}</Text>
								</FadeInView>
								<FadeInView index={2} style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<AnimatedNumber value={classicScore} style={[styles.statValue, { color: currentTheme.accent }]} />
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>{t("profile.classic")}</Text>
								</FadeInView>
								<FadeInView index={3} style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<AnimatedNumber value={chaosScore} style={[styles.statValue, { color: currentTheme.accent }]} />
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>{t("profile.chaos")}</Text>
								</FadeInView>
								<FadeInView index={4} style={[styles.statBox, isMobile && styles.mobileStatBox, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
									<AnimatedNumber value={gamesPlayed} style={[styles.statValue, { color: currentTheme.accent }]} />
									<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>{t("profile.matches")}</Text>
								</FadeInView>
							</View>
						)}

						{activeTab === "history" && (
							<FadeInView key="history" style={styles.tabContentContainer}>
								<MatchHistoryList userId={session?.user?.id || playerName} />
							</FadeInView>
						)}

						{activeTab === "friends" && (
							<FadeInView key="friends" style={styles.tabContentContainer}>
								<FriendsList userId={session?.user?.id || playerName} />
							</FadeInView>
						)}

						{session ? (
							<>
								<StylizedButton 
									onClick={handleLogout}
									text={t("profile.logOut")}
									backgroundColor="rgb(204, 51, 0)"
									style={{ marginTop: 20 }}
								/>

								<StylizedButton
									onClick={() => { playSfx('menuClick'); setDeleteAccountOpen(true); }}
									text={t("acct.open")}
									backgroundColor="rgb(90, 30, 30)"
									style={{ marginTop: 6, minHeight: 36 }}
									textStyle={{ fontSize: 11 }}
								/>
							</>
						) : (
							// a guest has nothing to sign out of: the button leads to the sign-in form
							<StylizedButton
								onClick={() => { playSfx('menuClick'); setShowAuth(true); }}
								text={t("profile.logIn")}
								backgroundColor={currentTheme.buttonPrimary}
								style={{ marginTop: 20 }}
							/>
						)}
					</View>
				) : (
					<View style={[styles.authContainer, isMobile && styles.mobileAuthContainer]}>
						<Text style={[styles.authTitle, { color: currentTheme.textPrimary }]}>
							{authMode === "login" ? t("profile.loginTitle") : t("profile.createAccountTitle")}
						</Text>

						<View style={styles.perksBox}>
							<Text style={styles.perksTitle}>{t("profile.perksTitle")}</Text>
							{(["profile.perkSync", "profile.perkFriends", "profile.perkElo", "profile.perkCoins"] as const).map((key) => (
								<Text key={key} style={[styles.perkLine, { color: currentTheme.textPrimary }]}>{"\u25AA "}{t(key)}</Text>
							))}
						</View>

						{resetMode && authMode === "login" ? (
							<>
								<Text style={[styles.confirmText, { color: currentTheme.textSecondary, marginBottom: 8 }]}>{t("profile.resetHint")}</Text>
								<TextInput
									style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
									placeholder={t("profile.emailPlaceholder")}
									placeholderTextColor={currentTheme.textSecondary}
									value={email}
									onChangeText={setEmail}
									autoCapitalize="none"
									keyboardType="email-address"
								/>
								{errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
								{resetNote ? <Text style={styles.resetNote}>{resetNote}</Text> : null}
								<StylizedButton
									onClick={() => void handlePasswordReset()}
									text={authLoading ? "..." : t("profile.resetSend")}
									backgroundColor={currentTheme.buttonPrimary}
									style={[styles.authButton, isMobile && styles.mobileAuthButton]}
									textStyle={isMobile && styles.mobileAuthButtonText}
								/>
								<Text style={styles.needAccountLink} onPress={() => { playSfx('menuClick'); setResetMode(false); setResetNote(null); setErrorMessage(""); }}>{t("profile.resetBack")}</Text>
							</>
						) : (
						<>
						{pendingEmail && authMode === "login" && (
							<View style={styles.confirmBox}>
								<Text style={styles.confirmTitle}>{t("profile.confirmTitle")}</Text>
								<Text style={[styles.confirmText, { color: currentTheme.textSecondary }]}>{t("profile.confirmText", { email: pendingEmail })}</Text>
								<Text style={styles.confirmLink} onPress={() => void resendConfirmation()}>{resendNote ?? t("profile.confirmResend")}</Text>
							</View>
						)}

						{authMode === "register" && (
							<TextInput
								style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
								placeholder={t("profile.playerNamePlaceholder")}
								placeholderTextColor={currentTheme.textSecondary}
								value={registerName}
								onChangeText={setRegisterName}
							/>
						)}

						<TextInput
							style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
							placeholder={t("profile.emailPlaceholder")}
							placeholderTextColor={currentTheme.textSecondary}
							value={email}
							onChangeText={setEmail}
							autoCapitalize="none"
							keyboardType="email-address"
						/>
						<TextInput
							style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
							placeholder={t("profile.passwordPlaceholder")}
							placeholderTextColor={currentTheme.textSecondary}
							value={password}
							onChangeText={setPassword}
							secureTextEntry
						/>

						{authMode === "login" && (
							<Text style={styles.forgotLink} onPress={() => { playSfx('menuClick'); setResetMode(true); setErrorMessage(""); }}>{t("profile.forgotPassword")}</Text>
						)}

						{errorMessage ? (
							<Text style={styles.errorText}>{errorMessage}</Text>
						) : null}

						<StylizedButton 
							onClick={handleAuth} 
							text={authLoading ? "..." : (authMode === "login" ? t("profile.logIn") : t("profile.register"))}
							backgroundColor={currentTheme.buttonPrimary}
							style={[styles.authButton, isMobile && styles.mobileAuthButton]}
							textStyle={isMobile && styles.mobileAuthButtonText}
						/>

						{IN_DISCORD_ACTIVITY ? (
							<Text style={{ color: currentTheme.textSecondary, fontSize: 12, textAlign: "center", marginTop: 10 }}>
								{t("profile.discordActivityAuthHint")}
							</Text>
						) : (
							<>
								<StylizedButton 
									onClick={handleGoogleSignIn}
									text={t("profile.googleSignIn")}
									backgroundColor="transparent"
									borderColor="rgba(255, 255, 255, 0.55)"
									style={[styles.authButton, isMobile && styles.mobileAuthButton]}
									textStyle={isMobile && styles.mobileAuthButtonText}
								/>

								<StylizedButton 
									onClick={handleDiscordSignIn}
									text={t("profile.discordSignIn")}
									backgroundColor="transparent"
									borderColor="rgba(255, 255, 255, 0.55)"
									style={[styles.authButton, isMobile && styles.mobileAuthButton]}
									textStyle={isMobile && styles.mobileAuthButtonText}
								/>
							</>
						)}

						<StylizedButton 
							onClick={() => {
								playSfx('menuClick');
								setAuthMode(authMode === "login" ? "register" : "login");
								setErrorMessage("");
							}} 
							text={authMode === "login" ? t("profile.needAccount") : t("profile.haveAccount")}
							backgroundColor="transparent"
							borderColor="transparent"
							textStyle={{ fontSize: 13, color: "#E5E7EB", textDecorationLine: "underline" }}
							style={{ marginTop: 5 }}
						/>
						</>
						)}
					</View>
				)}
			</ScrollView>

		</SimplePopupView>

		{showAvatarPopup && (
			<SimplePopupView style={[
				{ backgroundColor: currentTheme.menuBackground, position: "absolute", zIndex: 100 },
				isMobile && { width: '92%', height: '85%', paddingHorizontal: 10 }
			]}>
				<Text style={[styles.sectionHeader, { color: currentTheme.textPrimary }]}>{t("profile.avatarTitle")}</Text>
				<ScrollView style={{ width: "100%", marginTop: 20 }}>
					<StylizedButton
						onClick={async () => {
							if (!session?.user || avatarUploading) return;
							setAvatarUploading(true);
							setAvatarUploadFailed(false);
							const result = await pickAndUploadAvatar(session.user.id);
							setAvatarUploading(false);
							if (result.status === "ok") {
								setAvatarUrl(result.url);
								setShowAvatarPopup(false);
							} else if (result.status === "failed") {
								setAvatarUploadFailed(true);
							}
						}}
						text={avatarUploading ? t("profile.uploading") : t("profile.chooseFile")}
						disabled={avatarUploading}
						backgroundColor={currentTheme.buttonPrimary}
						style={{ marginTop: 24 }}
					/>
					{avatarUploadFailed && <Text style={[styles.inputLabel, { color: "#F87171", marginTop: 8, textAlign: "center" }]}>{t("profile.uploadFailed")}</Text>}
					<Text style={[styles.inputLabel, { color: currentTheme.textSecondary, marginTop: 8, textAlign: "center", fontSize: 11 }]}>{t("profile.avatarNotice")}</Text>

					{avatarUrl && avatarUrl.startsWith("http") ? (
						<StylizedButton
							onClick={async () => {
								if (!session?.user) return;
								const userId = session.user.id;
								setAvatarUrl(null);
								setShowAvatarPopup(false);
								await updateProfileAvatar(userId, null);
								void removeAvatarFiles(userId);
							}}
							text={t("profile.removePhoto")}
							backgroundColor="rgb(200,50,50)"
							style={{ marginTop: 16 }}
						/>
					) : null}
				</ScrollView>
				<StylizedButton onClick={() => setShowAvatarPopup(false)} text={t("common.cancel")} backgroundColor={currentTheme.buttonSecondary} style={{ marginTop: 20 }} />
			</SimplePopupView>
		)}
		</>
	);
}

const styles = StyleSheet.create({
	confirmBox: {
		alignSelf: "stretch",
		gap: 6,
		padding: 12,
		marginBottom: 10,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(255,215,0,0.6)",
		backgroundColor: "rgba(255,215,0,0.08)",
	},
	confirmTitle: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		color: "#FFD700",
		textAlign: "center",
	},
	confirmText: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		lineHeight: 17,
		textAlign: "center",
	},
	confirmLink: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#93C5FD",
		textAlign: "center",
		paddingVertical: 4,
	},
	inputLabel: { fontSize: 14, marginBottom: 8 },
	perksBox: {
		width: "100%",
		marginBottom: 12,
		padding: 10,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.2)",
		backgroundColor: "rgba(255, 255, 255, 0.05)",
	},
	perksTitle: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#F0AF0C",
		marginBottom: 6,
	},
	perkLine: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		lineHeight: 17,
	},
	forgotLink: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#93C5FD",
		textDecorationLine: "underline",
		alignSelf: "flex-end",
		paddingVertical: 4,
		marginBottom: 2,
	},
	needAccountLink: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		color: "#E5E7EB",
		textDecorationLine: "underline",
		textAlign: "center",
		paddingVertical: 10,
	},
	resetNote: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#86EFAC",
		textAlign: "center",
		marginVertical: 6,
	},
	topBar: {
		width: '100%',
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 8,
		marginBottom: 12,
	},
	topBackButton: {
		width: 72,
		minWidth: 72,
		height: 38,
		minHeight: 38,
		margin: 0,
		paddingHorizontal: 8,
	},
	sectionHeader: {
		flex: 1,
		textAlign: 'center',
		fontSize: 16,
		fontFamily: 'Silkscreen',
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
		borderWidth: 1.5,
		borderRadius: 12,
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
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: 'rgba(255,255,255,0.12)',
		borderWidth: 3,
		borderColor: '#FFD700',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 16,
		overflow: 'hidden',
	},
	editAvatarBadge: {
		position: 'absolute',
		bottom: 16,
		right: 0,
		width: 28,
		height: 28,
		borderRadius: 6,
		backgroundColor: '#111827',
		borderWidth: 2,
		borderColor: '#F0AF0C',
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: "#000",
		shadowOpacity: 0.3,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
	},
	emojiAvatarBtn: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: 'rgba(255,255,255,0.1)',
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: 'transparent',
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
