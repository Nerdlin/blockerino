import React from 'react';
import LegalPage, { LegalBullet, LegalHeading, LegalParagraph } from '@/components/LegalPage';

export default function PrivacyPolicy() {
    return (
        <LegalPage title="Privacy Policy">
            <LegalParagraph>Effective Date: July 21, 2026</LegalParagraph>
                <LegalHeading>1. Information Collection and Scope</LegalHeading>
                <LegalParagraph>
                    Blockerino operates as an independent application within the Discord ecosystem. We adhere strictly to a data-minimization principle, collecting exclusively the essential information required for core functionality. This is limited to data provided by the Discord API, explicitly your Discord User ID, username, and avatar hash.
                </LegalParagraph>
                
                <LegalHeading>2. Utilization of Data</LegalHeading>
                <LegalParagraph>
                    The data we collect is utilized strictly for operational and service-delivery purposes, which encompass:
                </LegalParagraph>
                <LegalBullet>Persistent storage of user progression, Elo ratings, and historical match data.</LegalBullet>
                <LegalBullet>Rendering user identities across global and server-specific leaderboards.</LegalBullet>
                <LegalBullet>Facilitating real-time peer-to-peer multiplayer synchronization.</LegalBullet>
                <LegalParagraph>
                    Under no circumstances do we monetize, lease, or disseminate your personally identifiable information (PII) to unauthorized third-party entities, advertising networks, or data brokers.
                </LegalParagraph>
                
                <LegalHeading>3. Infrastructure Security and Retention</LegalHeading>
                <LegalParagraph>
                    All operational data is securely encrypted and maintained on Supabase infrastructure, a SOC2-compliant Backend-as-a-Service architecture. We enforce strict Row Level Security (RLS) policies and cryptographically secured APIs to mitigate unauthorized access and ensure data integrity.
                </LegalParagraph>
                
                <LegalHeading>4. Anonymous Usage Statistics</LegalHeading>
                <LegalParagraph>
                    To understand which parts of the game are used and where players get stuck, the application records anonymous usage events in our own database on Supabase. No third-party analytics or advertising service receives them.
                </LegalParagraph>
                <LegalBullet>What is recorded: screens opened, game modes started and finished, final scores, purchases of in-game items, the application version and platform, and a random identifier the application generates for itself (it is not a hardware or advertising identifier).</LegalBullet>
                <LegalBullet>If you are signed in, the server also links events to your account identifier. Guests are not linked to any account.</LegalBullet>
                <LegalBullet>Events are deleted automatically after 180 days.</LegalBullet>
                <LegalBullet>You can switch collection off at any time in Options, under Privacy. The application then stops recording and discards events that were not yet sent.</LegalBullet>

                <LegalHeading>5. Sign-In, Friends and Notifications</LegalHeading>
                <LegalBullet>Sign-in: if you sign in with Discord or Google, or with an email address, our authentication provider (Supabase) receives your account identifier, display name, email address and profile picture from that service. We use them only to run your account.</LegalBullet>
                <LegalBullet>Friends: friend requests and accepted friendships are stored with your account, and friends can see your nickname and season score.</LegalBullet>
                <LegalBullet>Push notifications (Android and iOS apps): if you allow notifications, a push token that identifies your device is stored with your account and sent to Expo and Google Firebase Cloud Messaging, which deliver the messages. We send notifications about being overtaken on the leaderboard, a streak that is about to end and the end of a season. Switch them off in your device settings or in the app; the token is then removed.</LegalBullet>
                <LegalBullet>In the web version and in Discord, the same messages are shown inside the game when you open it.</LegalBullet>

                <LegalHeading>6. User Rights and Data Erasure</LegalHeading>
                <LegalParagraph>
                    In accordance with global privacy standards, you maintain absolute sovereignty over your data. You reserve the right to request a complete purge of your records and associated metrics from our databases at any time by initiating a request via our official GitHub repository or Discord support channels.
                </LegalParagraph>
                
                <LegalHeading>7. Policy Iterations</LegalHeading>
                <LegalParagraph>
                    As the application evolves, we reserve the right to amend this Privacy Policy. Substantive modifications will be reflected directly on this page. Continued utilization of Blockerino following such revisions constitutes your explicit acknowledgment and consent to the updated terms.
                </LegalParagraph>
            
        </LegalPage>
    );
}
