import React from 'react';
import { ScrollView, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function TermsOfService() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <AnimatedBackground />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <TouchableOpacity onPress={() => router.push('/')} style={styles.backButton}>
                    <Text style={styles.backText}>{"< BACK TO GAME"}</Text>
                </TouchableOpacity>

                <Text style={styles.title}>Terms of Service for Blockerino</Text>
                <Text style={styles.date}>Effective Date: July 21, 2026</Text>
                
                <Text style={styles.heading}>1. Acceptance of Terms</Text>
                <Text style={styles.paragraph}>
                    By accessing, installing, or playing Blockerino on Discord, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
                </Text>
                
                <Text style={styles.heading}>2. Use of the Game</Text>
                <Text style={styles.paragraph}>
                    Blockerino is provided for entertainment purposes. You agree to use the game respectfully and in accordance with Discord's Community Guidelines. You agree not to:{'\n'}
                    • Use cheats, exploits, or third-party software to gain an unfair advantage.{'\n'}
                    • Attempt to hack, disrupt, or interfere with the game's servers or infrastructure.{'\n'}
                    • Use the game for any illegal or unauthorized purpose.
                </Text>
                
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
        maxWidth: 800,
        alignSelf: 'center',
        width: '100%',
    },
    backButton: {
        marginBottom: 30,
        padding: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignSelf: 'flex-start',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    backText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 10,
    },
    date: {
        fontSize: 16,
        color: '#888',
        marginBottom: 40,
    },
    heading: {
        fontSize: 22,
        fontWeight: '600',
        color: '#fff',
        marginTop: 30,
        marginBottom: 15,
    },
    paragraph: {
        fontSize: 16,
        color: '#ddd',
        lineHeight: 28,
        marginBottom: 10,
    },
});
