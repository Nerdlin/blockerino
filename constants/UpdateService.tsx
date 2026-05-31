import { Alert, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from './Supabase';

export interface AppVersionConfig {
    latestVersion: string;
    latestBuildNumber: number;
    downloadUrl: string;
    releaseNotes?: string;
    isMandatory?: boolean;
}

class UpdateService {
    private checkedThisSession = false;

    async checkForUpdates(force: boolean = false): Promise<void> {
        // Проверка только для Android
        if (Platform.OS !== 'android') {
            return;
        }

        if (this.checkedThisSession && !force) {
            return;
        }

        this.checkedThisSession = true;

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

            if (this.isNewerVersion(
                currentVersion,
                parseInt(currentBuildNumber),
                config.latestVersion,
                config.latestBuildNumber
            )) {
                this.showUpdateDialog(config);
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            this.checkedThisSession = false;
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

    private showUpdateDialog(config: AppVersionConfig): void {
        const title = 'Update Available';
        const message = `A new version (${config.latestVersion}) is available. ${config.releaseNotes || 'Please update to get the latest features and bug fixes.'}`;

        if (config.isMandatory) {
            // Обязательное обновление - только одна кнопка
            Alert.alert(
                title,
                message,
                [
                    {
                        text: 'Update Now',
                        onPress: () => this.openDownloadUrl(config.downloadUrl)
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
                        text: 'Later',
                        style: 'cancel'
                    },
                    {
                        text: 'Update Now',
                        onPress: () => this.openDownloadUrl(config.downloadUrl)
                    }
                ]
            );
        }
    }

    private async openDownloadUrl(url: string): Promise<void> {
        try {
            const supported = await Linking.canOpenURL(url);
            if (supported) {
                await Linking.openURL(url);
            } else {
                Alert.alert('Error', 'Cannot open download link');
            }
        } catch (error) {
            console.error('Error opening download URL:', error);
            Alert.alert('Error', 'Failed to open download link');
        }
    }

    resetSessionCheck(): void {
        this.checkedThisSession = false;
    }
}

export const updateService = new UpdateService();
