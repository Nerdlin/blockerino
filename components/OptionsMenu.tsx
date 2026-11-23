import { useIsAdmin } from "@/constants/Admin";
import { MenuStateType, useAppState } from "@/hooks/useAppState";
import { Linking, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions, Platform } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import SegmentedControl from "./SegmentedControl";
import { useCallback, useEffect, useState } from "react";
import * as Application from "expo-application";
import { updateService } from "@/constants/UpdateService";
import { useSoundSettings } from "@/constants/Sound";
import { HAPTIC_LEVELS, buzz, useHapticSettings } from "@/constants/Haptic";
import { effectsProfileSetting, useEffectsProfile, type EffectsProfile } from "@/constants/EffectsProfile";
import { ThemeType, opaqueColor, useTheme } from "@/constants/Theme";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, useLanguage, type Language } from "@/constants/Localization";
import Slider from "@react-native-community/slider";
import { clearActiveGame } from "@/constants/Storage";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { isAnalyticsEnabled, setAnalyticsEnabled } from "@/constants/Analytics";
import { useRouter, type Href } from "expo-router";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { PROFILE_VISIBILITIES, getProfileVisibility, setProfileVisibility, type ProfileVisibility } from "@/constants/PlayerProfile";
import { disablePush, enablePush, isPushEnabled, isPushSupported } from "@/constants/Notifications";

// Green means on and grey means off; red is never an "on" colour.
const SWITCH_TRACK = { false: "#4B5563", true: "#10B981" };

export default function OptionsMenu() {
	const haptics = useHapticSettings();
	const effectsProfile = useEffectsProfile();
	const [ appState, setAppState, appendAppState, popAppState ] = useAppState();
	const isAdmin = useIsAdmin();
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const { 
		musicVolume, 
		sfxVolume, 
		musicEnabled, 
		sfxEnabled, 
		updateMusicVolume, 
		updateSfxVolume, 
		toggleMusic, 
		toggleSfx, 
		playSfx,
		initialize 
	} = useSoundSettings();

	const { currentTheme } = useTheme();
	const { language, changeLanguage, loadLanguage, t } = useLanguage();
	useEffect(() => {
		initialize();
		loadLanguage();
	}, []);

	const handleLanguageChange = (next: Language) => {
		if (next === language) return;
		playSfx('menuClick');
		// The pixel font for the language is picked at launch, so a switch normally reloads the app. In the middle of a
		// game (or a More Games table) that would throw the player out, so the text switches now and the font follows
		// on the next launch.
		const inGame = !!appState.containsGameMode() || appState.containsState(MenuStateType.MULTIPLAYER_GAME) || appState.containsState(MenuStateType.MORE_GAMES);
		void changeLanguage(next, { reload: !inGame });
	};

	const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

	const handleCheckUpdates = async () => {
		playSfx('menuClick');
		setIsCheckingUpdates(true);
		try {
			await updateService.checkForUpdates(true);
		} finally {
			setIsCheckingUpdates(false);
		}
	};

	const handleButtonPress = useCallback(() => {
		playSfx('menuClick');
		popAppState();
	}, [playSfx, popAppState]);

	useEscapeKey(handleButtonPress);

	const [confirmQuit, setConfirmQuit] = useState(false);
	const handleQuitPress = () => {
		playSfx('menuClick');
		// the first tap asks, the second ends the game, so a stray tap does not lose it
		if (!confirmQuit) {
			setConfirmQuit(true);
			setTimeout(() => setConfirmQuit(false), 3000);
			return;
		}
		clearActiveGame();
		setAppState(MenuStateType.MENU);
	};

	const handleRestartPress = () => {
		playSfx('menuClick');
		clearActiveGame();
		
		const isMultiplayer = appState.containsState(MenuStateType.MULTIPLAYER_GAME);
		const modeSearch = appState.containsGameMode();
		const mode = modeSearch ? modeSearch.current : undefined;
		if (mode && !isMultiplayer) {
			setAppState(MenuStateType.MENU);
			setTimeout(() => {
				appendAppState(mode);
			}, 50);
		}
	};

	const handleMusicToggle = (value: boolean) => {
		toggleMusic(value);
		playSfx('menuClick');
	};

	const router = useRouter();
	const [analyticsOn, setAnalyticsOn] = useState(true);
	useEffect(() => { void isAnalyticsEnabled().then(setAnalyticsOn); }, []);
	const handleAnalyticsToggle = (value: boolean) => {
		setAnalyticsOn(value);
		void setAnalyticsEnabled(value);
	};

	const { signedIn } = useAccountIdentity();
	const [visibility, setVisibility] = useState<ProfileVisibility>("everyone");
	const [visibilityNote, setVisibilityNote] = useState<string | null>(null);
	useEffect(() => {
		if (!signedIn) return;
		let active = true;
		void getProfileVisibility().then((value) => {
			if (active && value) setVisibility(value);
		});
		return () => {
			active = false;
		};
	}, [signedIn]);
	const handleVisibilityChange = async (next: ProfileVisibility) => {
		if (next === visibility) return;
		playSfx('menuClick');
		const previous = visibility;
		setVisibility(next);
		setVisibilityNote(null);
		if (!(await setProfileVisibility(next))) {
			setVisibility(previous);
			setVisibilityNote(t("pp.visFailed"));
		}
	};

	const pushAvailable = isPushSupported();
	const [pushOn, setPushOn] = useState(false);
	const [pushNote, setPushNote] = useState<string | null>(null);
	useEffect(() => { if (pushAvailable) void isPushEnabled().then(setPushOn); }, [pushAvailable]);
	const handlePushToggle = async (value: boolean) => {
		setPushNote(null);
		if (!value) {
			setPushOn(false);
			await disablePush();
			return;
		}
		const status = await enablePush();
		setPushOn(status === "enabled");
		if (status === "denied") setPushNote(t("notif.pushDenied"));
		else if (status === "needs_account") setPushNote(t("notif.pushNeedsAccount"));
		else if (status === "error") setPushNote(t("notif.pushError"));
	};

	const handleSfxToggle = (value: boolean) => {
		toggleSfx(value);
		playSfx('menuClick');
	};

	const inGame = appState.containsGameMode() || appState.containsState(MenuStateType.MULTIPLAYER_GAME);
	// Back / Resume sits top-left like on every other screen; the footer keeps only the in-game actions.
	const buttons = inGame ? (
		<View style={styles.buttonsContainer}>
			{(
				<>
					{(appState.containsGameMode() && !appState.containsState(MenuStateType.MULTIPLAYER_GAME)) && (
						<StylizedButton
							onClick={handleRestartPress}
							text={t("settings.restart")}
							backgroundColor={currentTheme.buttonPrimary}
							style={isMobile && styles.mobileBottomButton}
							textStyle={isMobile && styles.mobileBottomButtonText}
						/>
					)}
					<StylizedButton
						onClick={handleQuitPress}
						text={confirmQuit ? t("settings.endGameSure") : t("settings.endGame")}
						backgroundColor={currentTheme.id === ThemeType.BLUE ? 'rgb(204, 51, 0)' : currentTheme.buttonPrimary}
						style={isMobile && styles.mobileBottomButton}
						textStyle={isMobile && styles.mobileBottomButtonText}
					/>
				</>
			)}
		</View>
	) : undefined;

	return (
		<SimplePopupView footer={buttons} style={[
			{ backgroundColor: opaqueColor(currentTheme.menuBackground), justifyContent: "flex-start" },
			isMobile && { width: '92%', height: '85%', paddingHorizontal: 10 }
		]}>
			<View style={styles.topBar}>
				<StylizedButton
					onClick={handleButtonPress}
					text={inGame ? t("settings.resume") : t("common.back")}
					backgroundColor={currentTheme.buttonSecondary}
					style={styles.topBackButton}
					textStyle={{ fontSize: 12 }}
				/>
				<Text style={[styles.topTitle, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t("settings.title")}</Text>
			</View>

			<ScrollView
				style={styles.optionsScroll}
				contentContainerStyle={styles.optionsScrollContent}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.sound")}</Text>

					<SettingLabel
						title={t("settings.music")}
						description={t("settings.musicDesc")}
						labelStyle={{ color: currentTheme.textPrimary }}
						descStyle={{ color: currentTheme.textSecondary }}
					>
						<Switch
							value={musicEnabled}
							onValueChange={handleMusicToggle}
							trackColor={SWITCH_TRACK}
						/>
					</SettingLabel>

					{musicEnabled && (
						<View style={styles.sliderContainer}>
							<Slider
								style={styles.slider}
								minimumValue={0}
								maximumValue={1}
								value={musicVolume}
								onValueChange={updateMusicVolume}
								minimumTrackTintColor={currentTheme.buttonPrimary}
								maximumTrackTintColor={currentTheme.textSecondary}
								thumbTintColor={currentTheme.accent}
							/>
							<Text style={[styles.sliderValue, { color: currentTheme.textSecondary }]}>
								{Math.round(musicVolume * 100)}%
							</Text>
						</View>
					)}

					<SettingLabel
						title={t("settings.sfx")}
						description={t("settings.sfxDesc")}
						labelStyle={{ color: currentTheme.textPrimary }}
						descStyle={{ color: currentTheme.textSecondary }}
					>
						<Switch
							value={sfxEnabled}
							onValueChange={handleSfxToggle}
							trackColor={SWITCH_TRACK}
						/>
					</SettingLabel>

					{sfxEnabled && (
						<View style={styles.sliderContainer}>
							<Slider
								style={styles.slider}
								minimumValue={0}
								maximumValue={1}
								value={sfxVolume}
								onValueChange={updateSfxVolume}
								minimumTrackTintColor={currentTheme.buttonPrimary}
								maximumTrackTintColor={currentTheme.textSecondary}
								thumbTintColor={currentTheme.accent}
							/>
							<Text style={[styles.sliderValue, { color: currentTheme.textSecondary }]}>
								{Math.round(sfxVolume * 100)}%
							</Text>
						</View>
					)}
				</View>

				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.haptics")}</Text>
					<SettingLabel
						title={t("settings.haptics")}
						description={t("settings.hapticsDesc")}
						labelStyle={{ color: currentTheme.textPrimary }}
						descStyle={{ color: currentTheme.textSecondary }}
					>
						<Switch
							value={haptics.enabled}
							onValueChange={(value) => { haptics.setEnabled(value); if (value) buzz("medium"); }}
							trackColor={SWITCH_TRACK}
						/>
					</SettingLabel>
					{haptics.enabled && (
						<View style={styles.sliderContainer}>
							<Slider
								style={styles.slider}
								minimumValue={0}
								maximumValue={HAPTIC_LEVELS - 1}
								step={1}
								value={haptics.level}
								onValueChange={(value) => { const level = Math.round(value); if (level !== haptics.level) { haptics.setLevel(level); buzz("medium"); } }}
								minimumTrackTintColor={currentTheme.buttonPrimary}
								maximumTrackTintColor={currentTheme.textSecondary}
								thumbTintColor={currentTheme.accent}
							/>
							<Text style={[styles.sliderValue, { color: currentTheme.textSecondary, width: 80 }]} numberOfLines={1}>{t(`settings.hapticsLevel${haptics.level}`)}</Text>
						</View>
					)}
				</View>

				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.effects")}</Text>
					<Text style={[styles.settingDesc, { color: currentTheme.textSecondary, marginBottom: 10, textAlign: "center" }]}>{t("settings.effectsDesc")}</Text>
					<SegmentedControl
						items={[{ key: "full", label: t("settings.effectsFull") }, { key: "light", label: t("settings.effectsLight") }]}
						value={effectsProfile}
						onChange={(key: string) => effectsProfileSetting.set(key as EffectsProfile)}
						small
					/>
				</View>

				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.language")}</Text>
					<Text style={[styles.settingDesc, { color: currentTheme.textSecondary, marginBottom: 10 }]}>{t("settings.languageDesc")}</Text>

					<SegmentedControl
						items={SUPPORTED_LANGUAGES.map((lang) => ({ key: lang, label: LANGUAGE_LABELS[lang] }))}
						value={language}
						onChange={handleLanguageChange}
						small
					/>
				</View>

				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.privacy")}</Text>

					<SettingLabel
						title={t("settings.analytics")}
						description={t("settings.analyticsDesc")}
						labelStyle={{ color: currentTheme.textPrimary }}
						descStyle={{ color: currentTheme.textSecondary }}
					>
						<Switch
							value={analyticsOn}
							onValueChange={handleAnalyticsToggle}
							trackColor={SWITCH_TRACK}
						/>
					</SettingLabel>

					<View style={styles.visibilityBlock}>
						<Text style={[styles.settingTitle, { color: currentTheme.textPrimary }]}>{t("pp.visibility")}</Text>
						<Text style={[styles.settingDesc, { color: currentTheme.textSecondary, marginBottom: 8 }]}>
							{signedIn ? t("pp.visibilityDesc") : t("pp.visSignIn")}
						</Text>
						{signedIn && (
							<SegmentedControl
								items={PROFILE_VISIBILITIES.map((key) => ({ key, label: t(`pp.vis.${key}`) }))}
								value={visibility}
								onChange={(next) => void handleVisibilityChange(next)}
								small
							/>
						)}
						{visibilityNote && <Text style={[styles.settingDesc, { color: "#F87171", marginTop: 6 }]}>{visibilityNote}</Text>}
					</View>

					{pushAvailable && (
						<>
							<SettingLabel
								title={t("settings.push")}
								description={t("settings.pushDesc")}
								labelStyle={{ color: currentTheme.textPrimary }}
								descStyle={{ color: currentTheme.textSecondary }}
							>
								<Switch
									value={pushOn}
									onValueChange={(value) => void handlePushToggle(value)}
									trackColor={SWITCH_TRACK}
								/>
							</SettingLabel>
							{pushNote && <Text style={[styles.settingDesc, { color: currentTheme.textSecondary }]}>{pushNote}</Text>}
						</>
					)}
				</View>

				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.about")}</Text>
					<StylizedButton
						text={t("settings.licenses")}
						onClick={() => router.push("/licenses" as Href)}
						backgroundColor={currentTheme.buttonSecondary}
						style={isMobile ? { minWidth: 200, margin: 4 } : { minWidth: 240, margin: 4 }}
					/>
					{isAdmin && (
						// only the admin account sees it; the server checks every admin call itself
						<StylizedButton
							text="Админ-панель"
							onClick={() => appendAppState(MenuStateType.ADMIN)}
							backgroundColor="#7C3AED"
							style={isMobile ? { minWidth: 200, margin: 4 } : { minWidth: 240, margin: 4 }}
						/>
					)}
					<StylizedButton
						text={t("settings.github")}
						onClick={() => void Linking.openURL("https://github.com/Nerdlin/blockerino")}
						backgroundColor={currentTheme.buttonSecondary}
						style={isMobile ? { minWidth: 200, margin: 4 } : { minWidth: 240, margin: 4 }}
					/>
				</View>

				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.updates")}</Text>
					<Text style={[styles.settingDesc, { color: currentTheme.textSecondary, marginBottom: 8 }]}>
						{`${t("settings.version")}: ${Application.nativeApplicationVersion || '2.0.9'} (${Application.nativeBuildVersion ? `build ${Application.nativeBuildVersion}` : 'latest'})`}
					</Text>
					{Platform.OS === 'android' && (
						<StylizedButton
							text={isCheckingUpdates ? t("settings.checkingUpdates") : t("settings.checkUpdates")}
							onClick={handleCheckUpdates}
							backgroundColor={currentTheme.buttonPrimary}
							style={isMobile ? { minWidth: 160, marginVertical: 4 } : { minWidth: 190, marginVertical: 4 }}
						/>
					)}
				</View>
			</ScrollView>
		</SimplePopupView>
	);
}

function SettingLabel({
	title, 
	description, 
	children,
	labelStyle,
	descStyle
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
	labelStyle?: object;
	descStyle?: object;
}) {
	return (
		<View style={styles.settingRow}>
			<View style={styles.settingText}>
				<Text style={[styles.settingTitle, labelStyle]}>{title}</Text>
				{description && <Text style={[styles.settingDesc, descStyle]}>{description}</Text>}
			</View>
			<View style={styles.settingControl}>
				{children}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	visibilityBlock: {
		width: '92%',
		marginTop: 8,
		marginBottom: 6,
	},
	settingRow: {
		width: '92%',
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
		marginVertical: 6,
	},
	settingText: {
		flex: 1,
		minWidth: 0,
	},
	settingControl: {
		flexShrink: 0,
	},
	optionsScroll: {
		width: "100%",
	},
	optionsScrollContent: {
		alignItems: "center",
		paddingBottom: 12,
	},
	settingTitle: {
		fontSize: 14,
		fontFamily: 'Silkscreen'
	},
	settingDesc: {
		fontSize: 8,
		fontFamily: 'Silkscreen'
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
		width: 112,
		minWidth: 112,
		height: 38,
		minHeight: 38,
		margin: 0,
		paddingHorizontal: 8,
	},
	topTitle: {
		flex: 1,
		textAlign: 'center',
		fontSize: 18,
		fontFamily: 'Silkscreen',
	},
	sectionHeader: {
		fontSize: 22,
		fontFamily: 'Silkscreen',
		marginBottom: 14,
	},
	sectionLabel: {
		fontSize: 13,
		fontFamily: 'Silkscreen',
		marginBottom: 8,
		alignSelf: 'flex-start',
		marginLeft: '6%',
	},
	sliderContainer: {
		width: '80%',
		flexDirection: 'row',
		alignItems: 'center',
		marginVertical: 10,
	},
	slider: {
		flex: 1,
		height: 40,
	},
	sliderValue: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		lineHeight: 16,
		width: 48,
		textAlign: "right",
		paddingTop: 2,
	},
	themesContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		width: '100%',
		marginVertical: 10,
	},
	settingSection: {
		width: '94%',
		alignItems: 'center',
		marginBottom: 12,
		paddingVertical: 12,
		paddingHorizontal: 8,
		borderRadius: 10,
		borderWidth: 1.5,
		borderColor: 'rgba(255, 255, 255, 0.18)',
		backgroundColor: 'rgba(255, 255, 255, 0.04)',
	},
	buttonsContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		width: '100%',
		gap: 6,
		marginTop: 0,
		paddingBottom: 0,
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
