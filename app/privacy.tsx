import React from 'react';
import { ScrollView, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import AnimatedBackground from '@/components/AnimatedBackground';

const BulletPoint = ({ children }: { children: React.ReactNode }) => (
    <View style={styles.bulletPoint}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={styles.bulletText}>{children}</Text>
    </View>
);

export default function PrivacyPolicy() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <AnimatedBackground />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <TouchableOpacity onPress={() => router.push('/')} style={styles.backButton}>
                    <Text style={styles.backText}>{"< BACK TO GAME"}</Text>
                </TouchableOpacity>

                <View style={styles.glassCard}>
                    <Text style={styles.title}>Privacy Policy</Text>
                    <Text style={styles.date}>Effective Date: October 20, 2026</Text>
                    
                    <View style={styles.divider} />
                    
                    <Text style={styles.heading}>1. Information We Collect</Text>
                    <Text style={styles.paragraph}>
                        Blockerino collects only what it needs to run the game. Depending on how you sign in and play, this includes:
                    </Text>
                    <BulletPoint>Discord sign-in: your Discord User ID, username, display name and avatar hash.</BulletPoint>
                    <BulletPoint>Email or Google sign-in: your email address, and for Google your name and profile picture. Passwords are handled by our authentication provider and are never visible to us in plain text.</BulletPoint>
                    <BulletPoint>Game data: your player name, scores, Elo rating, match history, season results and rewards, achievements, friends list, shop purchases and equipped cosmetics, and game ratings.</BulletPoint>
                    <BulletPoint>Matchmaking data: temporary room and match information needed to connect you with an opponent.</BulletPoint>
                    <Text style={styles.paragraph}>
                        Some settings and progress (language, sound, saved games, offline scores) are also stored locally on your device or in your browser.
                    </Text>
                    <Text style={styles.heading}>2. How We Use Data</Text>
                    <BulletPoint>Saving your progress, ratings, rewards and purchases.</BulletPoint>
                    <BulletPoint>Showing your name and avatar on leaderboards, in friend lists and in matches.</BulletPoint>
                    <BulletPoint>Running real-time multiplayer and matchmaking.</BulletPoint>
                    <BulletPoint>Preventing cheating and abuse.</BulletPoint>
                    <Text style={styles.paragraph}>
                        We do not sell, rent or share your personal information with advertisers or data brokers.
                    </Text>
                    <Text style={styles.heading}>3. Discord Activity and Rich Presence</Text>
                    <Text style={styles.paragraph}>
                        When you play inside a Discord Activity, Blockerino asks for the identify and rpc.activities.write permissions. We use the second one only to show your current status on your Discord profile, for example the game mode you are playing, whether you are in a menu, a match or searching for an opponent, and for how long. We do not read your Discord messages, servers, friends or other activity.
                    </Text>
                    <Text style={styles.heading}>4. Third-Party Services</Text>
                    <Text style={styles.paragraph}>
                        We rely on Discord (sign-in and Activity), Google (optional sign-in) and Supabase (database, authentication and server functions). Their handling of data is governed by their own privacy policies.
                    </Text>
                    <Text style={styles.heading}>5. Security and Retention</Text>
                    <Text style={styles.paragraph}>
                        Data is stored on Supabase infrastructure with Row Level Security and encrypted connections. We keep your data while your account exists, and delete it when you ask us to.
                    </Text>
                    <Text style={styles.heading}>6. Your Rights and Data Deletion</Text>
                    <Text style={styles.paragraph}>
                        You can ask us to access, correct or completely delete your account and associated data at any time by emailing nerdlinnut@gmail.com. Please write from the email linked to your account or include your player name so we can find it.
                    </Text>
                    <Text style={styles.heading}>7. Children</Text>
                    <Text style={styles.paragraph}>
                        Blockerino is not directed at children under 13, and we do not knowingly collect their data. If you believe a child has provided data, contact us and we will remove it.
                    </Text>
                    <Text style={styles.heading}>8. Policy Changes</Text>
                    <Text style={styles.paragraph}>
                        We may update this Privacy Policy as the game evolves. The current version is always on this page, with its effective date at the top. Continued use after a change means you accept the updated policy.
                    </Text>
                    <Text style={styles.heading}>9. Contact</Text>
                    <Text style={styles.paragraph}>
                        Questions about privacy: nerdlinnut@gmail.com.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#050510',
    },
    scrollContent: {
        padding: 40,
        maxWidth: 900,
        alignSelf: 'center',
        width: '100%',
    },
    backButton: {
        marginBottom: 30,
        paddingVertical: 12,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        alignSelf: 'flex-start',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    backText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    glassCard: {
        backgroundColor: 'rgba(20, 20, 35, 0.85)',
        borderRadius: 24,
        padding: 40,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 10,
    },
    title: {
        fontSize: 42,
        fontWeight: '900',
        color: '#ffffff',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    date: {
        fontSize: 14,
        color: '#9ca3af',
        marginBottom: 24,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        fontWeight: '700',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 24,
        width: '100%',
    },
    heading: {
        fontSize: 24,
        fontWeight: '800',
        color: '#f3f4f6',
        marginTop: 32,
        marginBottom: 16,
        letterSpacing: -0.3,
    },
    paragraph: {
        fontSize: 17,
        color: '#d1d5db',
        lineHeight: 28,
        marginBottom: 12,
        letterSpacing: 0.2,
    },
    bulletPoint: {
        flexDirection: 'row',
        marginBottom: 12,
        paddingLeft: 16,
        paddingRight: 16,
    },
    bulletDot: {
        fontSize: 18,
        color: '#8b5cf6',
        marginRight: 16,
        lineHeight: 28,
        fontWeight: 'bold',
    },
    bulletText: {
        flex: 1,
        fontSize: 17,
        color: '#d1d5db',
        lineHeight: 28,
        letterSpacing: 0.2,
    },
});
