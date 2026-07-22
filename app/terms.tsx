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
                        By accessing, authenticating via Discord, or utilizing Blockerino in any capacity, you establish a binding agreement to adhere to these Terms of Service. If you do not consent to these stipulations in their entirety, you are expressly prohibited from utilizing the application and must immediately cease access.
                    </Text>
                    
                    <Text style={styles.heading}>2. Authorized Use and Conduct</Text>
                    <Text style={styles.paragraph}>
                        Blockerino is provisioned exclusively for personal, non-commercial entertainment purposes. As a condition of your use, you agree to comply with all applicable Discord Community Guidelines and agree that you shall not under any circumstances:
                    </Text>
                    <BulletPoint>Employ exploits, macros, automated scripts, or third-party modifications designed to grant an unfair competitive advantage or manipulate the Elo ranking system.</BulletPoint>
                    <BulletPoint>Engage in reverse engineering, packet sniffing, or any attempt to disrupt, compromise, or over-burden the underlying server architecture.</BulletPoint>
                    <BulletPoint>Utilize the application infrastructure for unauthorized data scraping, abuse, or any illicit activities.</BulletPoint>
                    
                    <Text style={styles.heading}>3. Disclaimer of Warranties</Text>
                    <Text style={styles.paragraph}>
                        The application and its underlying services are provided on a strictly "AS IS" and "AS AVAILABLE" basis, without express or implied warranties of any kind. The developer disclaims all warranties, including but not limited to merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee absolute system availability, fault tolerance, or immunity from cryptographic or infrastructural vulnerabilities.
                    </Text>
                    
                    <Text style={styles.heading}>4. Limitation of Liability</Text>
                    <Text style={styles.paragraph}>
                        To the maximum extent permitted by applicable law, in no event shall the developer be held liable for any direct, indirect, incidental, punitive, or consequential damages (including, without limitation, loss of data, reputation, or access) arising out of or in any way connected with the utilization or performance of Blockerino, even if previously advised of the possibility of such damages.
                    </Text>
                    
                    <Text style={styles.heading}>5. Modifications and Severability</Text>
                    <Text style={styles.paragraph}>
                        We reserve the unilateral right to amend these Terms of Service at any given time without prior explicit notification. Continued utilization of the service following modifications constitutes binding acceptance of the updated terms. If any provision of these terms is deemed unlawful or unenforceable, that provision shall be deemed severable and shall not affect the validity of the remaining provisions.
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
