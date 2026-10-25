import { MenuStateType, useAppState } from "@/hooks/useAppState";
import { Linking, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions, TextInput, Platform } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import SegmentedControl from "./SegmentedControl";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Application from "expo-application";
import { updateService } from "@/constants/UpdateService";
import {
	CUSTOM_MUSIC_URL_KEY,
	CUSTOM_SFX_URL_KEY,
	getCustomAudioSourceInfo,
	useSoundSettings,
} from "@/constants/Sound";
import { Theme, ThemeType, useTheme } from "@/constants/Theme";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, useLanguage, type Language } from "@/constants/Localization";
import Slider from "@react-native-community/slider";
import { clearActiveGame } from "@/constants/Storage";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useShopState } from "@/constants/Shop";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isAnalyticsEnabled, setAnalyticsEnabled } from "@/constants/Analytics";
import { useRouter, type Href } from "expo-router";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { PROFILE_VISIBILITIES, getProfileVisibility, setProfileVisibility, type ProfileVisibility } from "@/constants/PlayerProfile";
import { disablePush, enablePush, isPushEnabled, isPushSupported } from "@/constants/Notifications";

export default function OptionsMenu() {
	const [ appState, setAppState, appendAppState, popAppState ] = useAppState();
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
	const { state: shopState } = useShopState();
	const [customMusicUrl, setCustomMusicUrl] = useState("");
	const [customSfxUrl, setCustomSfxUrl] = useState("");

	useEffect(() => {
		AsyncStorage.getItem(CUSTOM_MUSIC_URL_KEY).then(val => { if (val) setCustomMusicUrl(val); });
		AsyncStorage.getItem(CUSTOM_SFX_URL_KEY).then(val => { if (val) setCustomSfxUrl(val); });
	}, []);

	const handleCustomMusicUrlBlur = () => {
		AsyncStorage.setItem(CUSTOM_MUSIC_URL_KEY, customMusicUrl.trim());
	};
	
	const handleCustomSfxUrlBlur = () => {
		AsyncStorage.setItem(CUSTOM_SFX_URL_KEY, customSfxUrl.trim());
	};

	useEffect(() => {
		initialize();
		loadLanguage();
	}, []);

	const handleLanguageChange = (next: Language) => {
		if (next === language) return;
		playSfx('menuClick');
		void changeLanguage(next);
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

	const handleQuitPress = () => {
		playSfx('menuClick');
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

	const buttons = (
		<View style={styles.buttonsContainer}>
			<StylizedButton
				onClick={handleButtonPress}
				text="Back"
				backgroundColor={currentTheme.buttonSecondary}
				style={isMobile && styles.mobileBottomButton}
				textStyle={isMobile && styles.mobileBottomButtonText}
			/>

			{(appState.containsGameMode() || appState.containsState(MenuStateType.MULTIPLAYER_GAME)) && (
				<>
					{(appState.containsGameMode() && !appState.containsState(MenuStateType.MULTIPLAYER_GAME)) && (
						<StylizedButton
							onClick={handleRestartPress}
							text="Restart"
							backgroundColor={currentTheme.buttonPrimary}
							style={isMobile && styles.mobileBottomButton}
							textStyle={isMobile && styles.mobileBottomButtonText}
						/>
					)}
					<StylizedButton
						onClick={handleQuitPress}
						text="End Game"
						backgroundColor={currentTheme.id === ThemeType.BLUE ? 'rgb(204, 51, 0)' : currentTheme.buttonPrimary}
						style={isMobile && styles.mobileBottomButton}
						textStyle={isMobile && styles.mobileBottomButtonText}
					/>
				</>
			)}
		</View>
	);

	return (
		<SimplePopupView footer={buttons} style={[
			{ backgroundColor: currentTheme.menuBackground },
			isMobile && { width: '92%', height: '85%', paddingHorizontal: 10 }
		]}>
			<Text style={[styles.sectionHeader, { color: currentTheme.textPrimary }]}>{t("settings.title")}</Text>

			<ScrollView
				style={styles.optionsScroll}
				contentContainerStyle={styles.optionsScrollContent}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.sound")}</Text>

					<SettingLabel
						title="Music"
						description="Background game music"
						labelStyle={{ color: currentTheme.textPrimary }}
						descStyle={{ color: currentTheme.textSecondary }}
					>
						<Switch
							value={musicEnabled}
							onValueChange={handleMusicToggle}
							trackColor={{ false: "#767577", true: currentTheme.buttonPrimary }}
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
						title="Sound Effects"
						description="Game action sounds"
						labelStyle={{ color: currentTheme.textPrimary }}
						descStyle={{ color: currentTheme.textSecondary }}
					>
						<Switch
							value={sfxEnabled}
							onValueChange={handleSfxToggle}
							trackColor={{ false: "#767577", true: currentTheme.buttonPrimary }}
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

					{shopState.equipped.music === "music_custom" && (
						<CustomAudioInput
							title="Custom Music Link"
							value={customMusicUrl}
							onChangeText={setCustomMusicUrl}
							onSave={handleCustomMusicUrlBlur}
							currentTheme={currentTheme}
							isMobile={isMobile}
						/>
					)}

					{shopState.equipped.sfx === "sfx_custom" && (
						<CustomAudioInput
							title="Custom SFX Link"
							value={customSfxUrl}
							onChangeText={setCustomSfxUrl}
							onSave={handleCustomSfxUrlBlur}
							currentTheme={currentTheme}
							isMobile={isMobile}
						/>
					)}
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
							trackColor={{ false: "#767577", true: currentTheme.buttonPrimary }}
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
									trackColor={{ false: "#767577", true: currentTheme.buttonPrimary }}
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
				</View>

				<View style={styles.settingSection}>
					<Text style={[styles.sectionLabel, { color: currentTheme.accent }]}>{t("settings.updates")}</Text>
					<Text style={[styles.settingDesc, { color: currentTheme.textSecondary, marginBottom: 8 }]}>
						{`${t("settings.version")}: ${Application.nativeApplicationVersion || '2.0.0'} (${Application.nativeBuildVersion ? `build ${Application.nativeBuildVersion}` : 'latest'})`}
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

function CustomAudioInput({
	title,
	value,
	onChangeText,
	onSave,
	currentTheme,
	isMobile,
}: {
	title: string;
	value: string;
	onChangeText: (value: string) => void;
	onSave: () => void;
	currentTheme: Theme;
	isMobile: boolean;
}) {
	const sourceInfo = useMemo(() => getCustomAudioSourceInfo(value), [value]);
	const canOpenExternal = sourceInfo.kind !== "empty" && !sourceInfo.canPlayInApp && sourceInfo.url.startsWith("http");

	const openExternal = async () => {
		onSave();
		if (canOpenExternal) {
			await Linking.openURL(sourceInfo.url);
		}
	};

	return (
		<View style={styles.customAudioContainer}>
			<Text style={[styles.settingTitle, { color: currentTheme.textPrimary }]}>{title}</Text>
			<TextInput
				style={[styles.urlInput, {
					color: currentTheme.textPrimary,
					borderColor: currentTheme.textSecondary,
					backgroundColor: 'rgba(0, 0, 0, 0.4)'
				}, isMobile && { fontSize: 10 }]}
				value={value}
				onChangeText={onChangeText}
				onBlur={onSave}
				onSubmitEditing={onSave}
				placeholder="YouTube, Spotify, Yandex, or direct .mp3"
				placeholderTextColor={currentTheme.textSecondary}
				autoCapitalize="none"
				autoCorrect={false}
			/>
			<View style={styles.customAudioStatusRow}>
				<Text style={[styles.customAudioStatus, { color: sourceInfo.canPlayInApp ? currentTheme.accent : currentTheme.textSecondary }]}>
					{sourceInfo.label}: {sourceInfo.message}
				</Text>
				{canOpenExternal && (
					<StylizedButton
						text="Open"
						onClick={openExternal}
						backgroundColor={currentTheme.buttonSecondary}
						style={styles.openLinkButton}
						textStyle={styles.openLinkButtonText}
					/>
				)}
			</View>
		</View>
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
		fontSize: 10,
		width: 40,
		textAlign: "right",
	},
	urlInput: {
		width: "100%",
		borderWidth: 1,
		borderRadius: 6,
		paddingHorizontal: 8,
		paddingVertical: 6,
		fontFamily: "Silkscreen",
		fontSize: 10,
		marginTop: 6,
	},
	customAudioContainer: {
		width: "80%",
		alignItems: "stretch",
		marginTop: 8,
		marginBottom: 8,
	},
	customAudioStatusRow: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 6,
	},
	customAudioStatus: {
		flex: 1,
		fontFamily: "Silkscreen",
		fontSize: 8,
		lineHeight: 12,
	},
	openLinkButton: {
		minWidth: 72,
		minHeight: 28,
		paddingHorizontal: 8,
	},
	openLinkButtonText: {
		fontSize: 10,
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
