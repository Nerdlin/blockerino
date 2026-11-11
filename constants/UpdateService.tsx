import { Alert, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from './Supabase';
import { loadStoredLanguage, translate, type Language } from './Localization';
import { getInstallerPackageName, getPlayUpdate, GOOGLE_PLAY_INSTALLER, startPlayUpdate } from '@/modules/install-source';

export interface AppVersionConfig {
    latestVersion: string;
    latestBuildNumber: number;
    downloadUrl: string;
    releaseNotes?: string;
    isMandatory?: boolean;
}

// Automatic checks (launch, coming back to the app, a timer) are throttled; a manual
// check from Settings always goes through.
const AUTO_CHECK_INTERVAL_MS = 15 * 60 * 1000;

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

        // An app from Google Play may only be updated through Play: it gets Play's own "Update available" window
        // (2.0.9 and newer); only the GitHub APK gets our dialog.
        if (getInstallerPackageName() === GOOGLE_PLAY_INSTALLER) {
            await this.checkPlayUpdate(force);
            return;
        }

        if (this.checking) return;
        if (!force && Date.now() - this.lastCheckAt < AUTO_CHECK_INTERVAL_MS) {
            return;
        }

        this.checking = true;
        const language = await loadStoredLanguage();

        try {
            const currentVersion = Application.nativeApplicationVersion || '1.0.0';
            const currentBuildNumber = Application.nativeBuildVersion || '1';

            // Получаем информацию о последней версии из Supabase
            const { data, error } = await supabase
                .from('app_config')
                .select('*')
                .eq('key', 'android_version')
                .single();

            if (error || !data) {
                console.log('No update config found');
                return;
            }

            const config = data.value as AppVersionConfig;

            this.lastCheckAt = Date.now();

            if (this.isNewerVersion(
                currentVersion,
                parseInt(currentBuildNumber),
                config.latestVersion,
                config.latestBuildNumber
            )) {
                if (force || config.latestBuildNumber > this.notifiedBuild) {
                    this.notifiedBuild = Math.max(this.notifiedBuild, config.latestBuildNumber);
                    this.showUpdateDialog(config, language);
                }
            } else if (force) {
                Alert.alert(translate(language, 'update.upToDateTitle'), translate(language, 'update.upToDate', { version: currentVersion }));
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            if (force) {
                Alert.alert(translate(language, 'update.failedTitle'), translate(language, 'update.failed'));
            }
        } finally {
            this.checking = false;
        }
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
                    Alert.alert(translate(language, 'update.upToDateTitle'), translate(language, 'update.upToDate', { version }));
                } else {
                    await this.openPlayListing();
                }
            }
        } finally {
            this.checking = false;
        }
    }

    private isNewerVersion(
        currentVersion: string,
        currentBuild: number,
        latestVersion: string,
        latestBuild: number
    ): boolean {
        const current = this.parseVersion(currentVersion, currentBuild);
        const latest = this.parseVersion(latestVersion, latestBuild);

        // Сравниваем major.minor.patch
        if (latest.major > current.major) return true;
        if (latest.major < current.major) return false;

        if (latest.minor > current.minor) return true;
        if (latest.minor < current.minor) return false;

        if (latest.patch > current.patch) return true;
        if (latest.patch < current.patch) return false;

        // Если версии одинаковые, сравниваем build number
        return latest.build > current.build;
    }

    private parseVersion(version: string, build: number) {
        const parts = version.split('.').map(p => parseInt(p) || 0);
        return {
            major: parts[0] || 0,
            minor: parts[1] || 0,
            patch: parts[2] || 0,
            build: build
        };
    }

    private showUpdateDialog(config: AppVersionConfig, language: Language): void {
        const title = translate(language, 'update.title');
        const message = translate(language, 'update.message', {
            version: config.latestVersion,
            notes: config.releaseNotes || translate(language, 'update.defaultNotes'),
        });

        if (config.isMandatory) {
            // Обязательное обновление - только одна кнопка
            Alert.alert(
                title,
                message,
                [
                    {
                        text: translate(language, 'update.now'),
                        onPress: () => this.openDownloadUrl(config.downloadUrl, language)
                    }
                ],
                { cancelable: false }
            );
        } else {
            // Опциональное обновление
            Alert.alert(
                title,
                message,
                [
                    {
                        text: translate(language, 'update.later'),
                        style: 'cancel'
                    },
                    {
                        text: translate(language, 'update.now'),
                        onPress: () => this.openDownloadUrl(config.downloadUrl, language)
                    }
                ]
            );
        }
    }

    private async openDownloadUrl(url: string, language: Language): Promise<void> {
        try {
            await Linking.openURL(url);
        } catch (error) {
            console.error('Error opening download URL:', error);
            Alert.alert(translate(language, 'update.openFailedTitle'), translate(language, 'update.openFailed'));
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
