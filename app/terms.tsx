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

export default function TermsOfService() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <AnimatedBackground />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <TouchableOpacity onPress={() => router.push('/')} style={styles.backButton}>
                    <Text style={styles.backText}>{"< BACK TO GAME"}</Text>
                </TouchableOpacity>

                <View style={styles.glassCard}>
                    <Text style={styles.title}>Terms of Service</Text>
                    <Text style={styles.date}>Effective Date: October 20, 2026</Text>
                    
                    <View style={styles.divider} />
                    
                    <Text style={styles.heading}>1. Acceptance of Terms</Text>
                    <Text style={styles.paragraph}>
                        By signing in with Discord, Google or email, or by using Blockerino in any other way, you agree to these Terms of Service. If you do not agree, do not use the application.
                    </Text>
                    <Text style={styles.heading}>2. Authorized Use and Conduct</Text>
                    <Text style={styles.paragraph}>
                        Blockerino is provided for personal, non-commercial entertainment. You agree to follow the Discord Community Guidelines and not to:
                    </Text>
                    <BulletPoint>Use exploits, macros, bots, scripts or modifications to gain an unfair advantage or manipulate Elo, leaderboards or season rankings.</BulletPoint>
                    <BulletPoint>Reverse engineer, packet sniff, or try to disrupt or overload our servers.</BulletPoint>
                    <BulletPoint>Scrape data or use the service for abuse or any unlawful purpose.</BulletPoint>
                    <BulletPoint>Choose offensive or impersonating names.</BulletPoint>
                    <Text style={styles.paragraph}>
                        We may remove scores, reset ratings or rewards, or suspend or delete accounts that break these rules.
                    </Text>
                    <Text style={styles.heading}>3. Accounts</Text>
                    <Text style={styles.paragraph}>
                        You are responsible for keeping your sign-in credentials safe and for activity on your account. Tell us at the contact below if you think your account was compromised.
                    </Text>
                    <Text style={styles.heading}>4. Virtual Items, Rewards and Seasons</Text>
                    <Text style={styles.paragraph}>
                        Cosmetics, titles, coins and other in-game rewards are virtual, have no cash value, and cannot be exchanged for money. Seasons, ratings and leaderboards may be reset, and game modes, rewards and features may change or be removed at any time.
                    </Text>
                    <Text style={styles.heading}>5. Disclaimer of Warranties</Text>
                    <Text style={styles.paragraph}>
                        The application and its services are provided on an AS IS and AS AVAILABLE basis, without warranties of any kind, including merchantability, fitness for a particular purpose and non-infringement. We do not guarantee uninterrupted availability or that data will never be lost.
                    </Text>
                    <Text style={styles.heading}>6. Limitation of Liability</Text>
                    <Text style={styles.paragraph}>
                        To the maximum extent permitted by law, the developer is not liable for any direct, indirect, incidental or consequential damages, including loss of data, progress or access, arising from the use of Blockerino.
                    </Text>
                    <Text style={styles.heading}>7. Privacy</Text>
                    <Text style={styles.paragraph}>
                        How we handle your data is described in our Privacy Policy.
                    </Text>
                    <Text style={styles.heading}>8. Modifications and Severability</Text>
                    <Text style={styles.paragraph}>
                        We may update these Terms at any time. Continued use after changes means you accept them. If any provision is found unenforceable, the remaining provisions stay in effect.
                    </Text>
                    <Text style={styles.heading}>9. Contact</Text>
                    <Text style={styles.paragraph}>
                        Questions about these Terms: nerdlinnut@gmail.com.
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
