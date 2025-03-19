import { cssColors } from "@/constants/Color";
import { MenuStateType, useAppState, useAppStateValue } from "@/hooks/useAppState";
import { StyleSheet, Switch, Text, View } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { useEffect } from "react";
import { useSoundSettings } from "@/constants/Sound";
import { Theme, ThemeType, useTheme } from "@/constants/Theme";
import Animated, { FadeIn } from "react-native-reanimated";
import Slider from "@react-native-community/slider";

export default function OptionsMenu() {
	const [ appState, setAppState, _appendAppState, popAppState ] = useAppState();
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

	const { currentTheme, changeTheme, loadTheme, availableThemes } = useTheme();

	useEffect(() => {
		initialize();
		loadTheme();
	}, []);

	const handleButtonPress = () => {
		playSfx('menuClick');
		popAppState();
	};

	const handleQuitPress = () => {
		playSfx('menuClick');
		setAppState(MenuStateType.MENU);
	};

	const handleMusicToggle = (value: boolean) => {
		toggleMusic(value);
		playSfx('menuClick');
	};

	const handleSfxToggle = (value: boolean) => {
		toggleSfx(value);
		playSfx('menuClick');
	};

	const handleThemeChange = (theme: ThemeType) => {
		changeTheme(theme);
		playSfx('menuClick');
	};

	return (
		<SimplePopupView style={[{ backgroundColor: currentTheme.menuBackground }]}>
			<Text style={[styles.sectionHeader, { color: currentTheme.textPrimary }]}>Settings</Text>
			
			<View style={styles.settingSection}>
				<Text style={[styles.sectionLabel, { color: currentTheme.textPrimary }]}>Sound</Text>
				
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
			</View>

			<View style={styles.settingSection}>
				<Text style={[styles.sectionLabel, { color: currentTheme.textPrimary }]}>Theme</Text>
				
				<View style={styles.themesContainer}>
					{availableThemes.map((theme) => (
						<ThemeButton 
							key={theme.id} 
							theme={theme} 
							isSelected={currentTheme.id === theme.id}
							onPress={() => handleThemeChange(theme.id)}
						/>
					))}
				</View>
			</View>

			<View style={styles.buttonsContainer}>
				<StylizedButton 
					onClick={handleButtonPress} 
					text="Back" 
					backgroundColor={currentTheme.buttonSecondary}
				/>
				
				{appState.containsGameMode() && (
					<StylizedButton 
						onClick={handleQuitPress} 
						text="End Game" 
						backgroundColor={currentTheme.buttonPrimary}
					/>
				)}
			</View>
		</SimplePopupView>
	);
}

function ThemeButton({ theme, isSelected, onPress }: { theme: Theme; isSelected: boolean; onPress: () => void }) {
	return (
		<Animated.View entering={FadeIn}>
			<StylizedButton
				text={theme.name}
				onClick={onPress}
				backgroundColor={theme.buttonPrimary}
				borderColor={isSelected ? theme.accent : "transparent"}
			/>
		</Animated.View>
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
		<View style={styles.settingLabelContainer}>
			<Text style={[styles.settingTitle, labelStyle]}>{title}</Text>
			{description && <Text style={[styles.settingDesc, descStyle]}>{description}</Text>}
			<View style={styles.settingLabelChildren}>
				{children}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	settingLabelContainer: {
		width: '80%',
		height: 'auto',
		justifyContent: 'flex-start',
		alignItems: 'flex-start',
		marginTop: 6,
		marginBottom: 6
	},
	settingLabelChildren: {
		width: 'auto',
		height: 'auto',
		position: 'absolute',
		alignSelf: 'flex-end',
		justifyContent: 'flex-end',
	},
	settingTitle: {
		fontSize: 16,
		fontFamily: 'Silkscreen'
	},
	settingDesc: {
		fontSize: 8,
		fontFamily: 'Silkscreen'
	},
	sectionHeader: {
		fontSize: 24,
		fontFamily: 'Silkscreen',
		marginBottom: 20,
	},
	sectionLabel: {
		fontSize: 18,
		fontFamily: 'Silkscreen',
		marginBottom: 10,
		alignSelf: 'flex-start',
		marginLeft: '10%',
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
		width: 50,
		textAlign: 'right',
		fontSize: 12,
		fontFamily: 'Silkscreen',
	},
	themesContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		width: '100%',
		marginVertical: 10,
	},
	settingSection: {
		width: '100%',
		alignItems: 'center',
		marginBottom: 20,
	},
	buttonsContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		marginTop: 20,
	}
});