import { gameAlert } from "@/constants/GameDialog";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { loadStoredLanguage, translate } from './Localization';
import { getInstallerPackageName, getPlayUpdate, GOOGLE_PLAY_INSTALLER, startPlayUpdate } from '@/modules/install-source';

// Automatic checks (launch, coming back to the app, a timer) are throttled; a manual
// check from Settings always goes through.
const AUTO_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const PLAY_SUGGESTED_KEY = "PLAY_MOVE_SUGGESTED";

// Google Play is the only update channel. A build from Google Play gets Play's own "Update available" window
// (2.0.9 and newer). An APK from GitHub is signed with another key, so it can never be updated over the Google Play
// version: it is pointed to the store once, and a manual check opens the store page.
class UpdateService {
    private lastCheckAt = 0;
    private checking = false;
    // The newest build we already told the player about in this app session, so coming
    // back to the app does not repeat the same dialog, but a newer release still does.
    private notifiedBuild = 0;

    async checkForUpdates(force: boolean = false): Promise<void> {
        // Проверка только для Android
        if (Platform.OS !== 'android') {
            return;
        }

        if (getInstallerPackageName() === GOOGLE_PLAY_INSTALLER) {
            await this.checkPlayUpdate(force);
            return;
        }

        if (force) {
            await this.openPlayListing();
            return;
        }
        await this.suggestPlayOnce();
    }

    /** A sideloaded APK hears about Google Play once; a development build never does. */
    private async suggestPlayOnce(): Promise<void> {
        if (__DEV__) return;
        try {
            if (await AsyncStorage.getItem(PLAY_SUGGESTED_KEY)) return;
            await AsyncStorage.setItem(PLAY_SUGGESTED_KEY, "true");
        } catch {
            return;
        }
        const language = await loadStoredLanguage();
        gameAlert(translate(language, 'update.playTitle'), translate(language, 'update.playMessage'), [
            { text: translate(language, 'update.later'), style: 'cancel' },
            { text: translate(language, 'update.playOpen'), onPress: () => void this.openPlayListing() },
        ]);
    }

    private async checkPlayUpdate(force: boolean): Promise<void> {
        if (this.checking) return;
        if (!force && Date.now() - this.lastCheckAt < AUTO_CHECK_INTERVAL_MS) return;
        this.checking = true;
        try {
            const info = await getPlayUpdate();
            this.lastCheckAt = Date.now();
            if (!info) {
                // a build before 2.0.9 cannot show Play's window: a manual check opens the Play Store page
                if (force) await this.openPlayListing();
                return;
            }
            // An update the player already started must be finished; a new one is offered once per app session
            // (a newer build is offered again), and a manual check always shows it.
            if (info.status === 'in_progress' || (info.status === 'available' && (force || info.versionCode > this.notifiedBuild))) {
                this.notifiedBuild = Math.max(this.notifiedBuild, info.versionCode);
                const result = await startPlayUpdate();
                if (result === 'failed' && force) await this.openPlayListing();
                return;
            }
            if (force) {
                if (info.status === 'none') {
                    const language = await loadStoredLanguage();
                    const version = Application.nativeApplicationVersion || '1.0.0';
                    gameAlert(translate(language, 'update.upToDateTitle'), translate(language, 'update.upToDate', { version }));
                } else {
                    await this.openPlayListing();
                }
            }
        } finally {
            this.checking = false;
        }
    }

    private async openPlayListing(): Promise<void> {
        const id = Application.applicationId || 'com.nerdlin.blockerino';
        try {
            await Linking.openURL(`market://details?id=${id}`);
        } catch {
            await Linking.openURL(`https://play.google.com/store/apps/details?id=${id}`).catch(() => undefined);
        }
    }

    resetSessionCheck(): void {
        this.lastCheckAt = 0;
        this.notifiedBuild = 0;
    }
}

export const updateService = new UpdateService();
