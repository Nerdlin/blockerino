import React from 'react';
import { ScrollView, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function PrivacyPolicy() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <AnimatedBackground />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <TouchableOpacity onPress={() => router.push('/')} style={styles.backButton}>
                    <Text style={styles.backText}>{"< BACK TO GAME"}</Text>
                </TouchableOpacity>

                <Text style={styles.title}>Privacy Policy for Blockerino</Text>
                <Text style={styles.date}>Effective Date: July 21, 2026</Text>
                
                <Text style={styles.heading}>1. Information We Collect</Text>
                <Text style={styles.paragraph}>
                    When you play Blockerino via Discord, we may collect basic information provided by the Discord API, such as your Discord user ID, username, and avatar. We only collect the minimum amount of data necessary to provide the game's core features.
                </Text>
                
                <Text style={styles.heading}>2. How We Use Your Information</Text>
                <Text style={styles.paragraph}>
                    Your information is used solely for the purpose of:{'\n'}
                    • Saving your game progress and high scores.{'\n'}
                    • Displaying your name and avatar on global and server leaderboards.{'\n'}
                    • Ensuring multiplayer synchronization.{'\n'}
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
