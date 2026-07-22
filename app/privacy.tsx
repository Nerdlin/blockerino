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
                    <Text style={styles.date}>Effective Date: July 21, 2026</Text>
                    
                    <View style={styles.divider} />
                    
                    <Text style={styles.heading}>1. Information We Collect</Text>
                    <Text style={styles.paragraph}>
                        When you play Blockerino via Discord, we may collect basic information provided by the Discord API, such as your Discord user ID, username, and avatar. We only collect the minimum amount of data necessary to provide the game's core features.
                    </Text>
                    
                    <Text style={styles.heading}>2. How We Use Your Information</Text>
                    <Text style={styles.paragraph}>
                        Your information is used solely for the purpose of:
                    </Text>
                    <BulletPoint>Saving your game progress and high scores.</BulletPoint>
                    <BulletPoint>Displaying your name and avatar on global and server leaderboards.</BulletPoint>
                    <BulletPoint>Ensuring multiplayer synchronization.</BulletPoint>
                    <Text style={[styles.paragraph, { marginTop: 12 }]}>
                        We do not sell, rent, or share your personal data with third parties.
                    </Text>
                    
                    <Text style={styles.heading}>3. Data Storage and Security</Text>
                    <Text style={styles.paragraph}>
                        Your game data is securely stored using Supabase (a secure backend-as-a-service platform). We take reasonable measures to protect your data from unauthorized access.
                    </Text>
                    
                    <Text style={styles.heading}>4. Data Deletion</Text>
                    <Text style={styles.paragraph}>
                        You can request the deletion of your data at any time by contacting the developer via GitHub or Discord.
                    </Text>
                    
                    <Text style={styles.heading}>5. Changes to This Policy</Text>
                    <Text style={styles.paragraph}>
                        We may update this Privacy Policy from time to time. Any changes will be posted directly on this page.
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
