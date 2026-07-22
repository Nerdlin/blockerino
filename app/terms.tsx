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
                    <Text style={styles.date}>Effective Date: July 21, 2026</Text>
                    
                    <View style={styles.divider} />
                    
                    <Text style={styles.heading}>1. Acceptance of Terms</Text>
                    <Text style={styles.paragraph}>
                        By accessing, installing, or playing Blockerino on Discord, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
                    </Text>
                    
                    <Text style={styles.heading}>2. Use of the Game</Text>
                    <Text style={styles.paragraph}>
                        Blockerino is provided for entertainment purposes. You agree to use the game respectfully and in accordance with Discord's Community Guidelines. You agree not to:
                    </Text>
                    <BulletPoint>Use cheats, exploits, or third-party software to gain an unfair advantage.</BulletPoint>
                    <BulletPoint>Attempt to hack, disrupt, or interfere with the game's servers or infrastructure.</BulletPoint>
                    <BulletPoint>Use the game for any illegal or unauthorized purpose.</BulletPoint>
                    
                    <Text style={styles.heading}>3. Disclaimer of Warranties</Text>
                    <Text style={styles.paragraph}>
                        The game is provided on an "as is" and "as available" basis without warranty of any kind. We do not guarantee that the game will be uninterrupted, error-free, or completely secure.
                    </Text>
                    
                    <Text style={styles.heading}>4. Limitation of Liability</Text>
                    <Text style={styles.paragraph}>
                        In no event shall the developer of Blockerino be liable for any direct, indirect, incidental, special, or consequential damages arising from the use of, or inability to use, the game.
                    </Text>
                    
                    <Text style={styles.heading}>5. Changes to the Terms</Text>
                    <Text style={styles.paragraph}>
                        We reserve the right to modify these Terms of Service at any time. Continued use of the game after any changes constitutes your acceptance of the new terms.
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
