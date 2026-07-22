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
                    
                    <Text style={styles.heading}>1. Information Collection and Scope</Text>
                    <Text style={styles.paragraph}>
                        Blockerino operates as an independent application within the Discord ecosystem. We adhere strictly to a data-minimization principle, collecting exclusively the essential information required for core functionality. This is limited to data provided by the Discord API, explicitly your Discord User ID, username, and avatar hash.
                    </Text>
                    
                    <Text style={styles.heading}>2. Utilization of Data</Text>
                    <Text style={styles.paragraph}>
                        The data we collect is utilized strictly for operational and service-delivery purposes, which encompass:
                    </Text>
                    <BulletPoint>Persistent storage of user progression, Elo ratings, and historical match data.</BulletPoint>
                    <BulletPoint>Rendering user identities across global and server-specific leaderboards.</BulletPoint>
                    <BulletPoint>Facilitating real-time peer-to-peer multiplayer synchronization.</BulletPoint>
                    <Text style={[styles.paragraph, { marginTop: 12 }]}>
                        Under no circumstances do we monetize, lease, or disseminate your personally identifiable information (PII) to unauthorized third-party entities, advertising networks, or data brokers.
                    </Text>
                    
                    <Text style={styles.heading}>3. Infrastructure Security and Retention</Text>
                    <Text style={styles.paragraph}>
                        All operational data is securely encrypted and maintained on Supabase infrastructure, a SOC2-compliant Backend-as-a-Service architecture. We enforce strict Row Level Security (RLS) policies and cryptographically secured APIs to mitigate unauthorized access and ensure data integrity.
                    </Text>
                    
                    <Text style={styles.heading}>4. User Rights and Data Erasure</Text>
                    <Text style={styles.paragraph}>
                        In accordance with global privacy standards, you maintain absolute sovereignty over your data. You reserve the right to request a complete purge of your records and associated metrics from our databases at any time by initiating a request via our official GitHub repository or Discord support channels.
                    </Text>
                    
                    <Text style={styles.heading}>5. Policy Iterations</Text>
                    <Text style={styles.paragraph}>
                        As the application evolves, we reserve the right to amend this Privacy Policy. Substantive modifications will be reflected directly on this page. Continued utilization of Blockerino following such revisions constitutes your explicit acknowledgment and consent to the updated terms.
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
