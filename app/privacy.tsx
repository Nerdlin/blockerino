import React from 'react';
import LegalPage, { LegalBullet, LegalHeading, LegalParagraph } from '@/components/LegalPage';

export default function PrivacyPolicy() {
    return (
        <LegalPage title="Privacy Policy">
                <LegalParagraph>Effective Date: October 27, 2026</LegalParagraph>
                <LegalHeading>1. Information We Collect</LegalHeading>
                <LegalParagraph>
                    Blockerino collects only what it needs to run the game. Depending on how you sign in and play, this includes:
                </LegalParagraph>
                <LegalBullet>Discord sign-in: your Discord User ID, username, display name and avatar hash.</LegalBullet>
                <LegalBullet>Email or Google sign-in: your email address, and for Google your name and profile picture. Passwords are handled by our authentication provider and are never visible to us in plain text.</LegalBullet>
                <LegalBullet>Game data: your player name, scores, Elo rating, match history, season results and rewards, achievements, friends list, shop purchases and equipped cosmetics, and game ratings.</LegalBullet>
                <LegalBullet>Matchmaking data: temporary room and match information needed to connect you with an opponent.</LegalBullet>
                <LegalParagraph>
                    Some settings and progress (language, sound, saved games, offline scores) are also stored locally on your device or in your browser.
                </LegalParagraph>

                <LegalHeading>2. How We Use Data</LegalHeading>
                <LegalBullet>Saving your progress, ratings, rewards and purchases.</LegalBullet>
                <LegalBullet>Showing your name and avatar on leaderboards, in friend lists and in matches.</LegalBullet>
                <LegalBullet>Running real-time multiplayer and matchmaking.</LegalBullet>
                <LegalBullet>Preventing cheating and abuse.</LegalBullet>
                <LegalParagraph>
                    We do not sell, rent or share your personal information with advertisers or data brokers.
                </LegalParagraph>

                <LegalHeading>3. Discord Activity and Rich Presence</LegalHeading>
                <LegalParagraph>
                    When you play inside a Discord Activity, Blockerino asks for the identify and rpc.activities.write permissions. We use the second one only to show your current status on your Discord profile, for example the game mode you are playing, whether you are in a menu, a match or searching for an opponent, and for how long. We do not read your Discord messages, servers, friends or other activity.
                </LegalParagraph>

                <LegalHeading>4. Third-Party Services</LegalHeading>
                <LegalParagraph>
                    We rely on Discord (sign-in and Activity), Google (optional sign-in) and Supabase (database, authentication and server functions). Their handling of data is governed by their own privacy policies.
                </LegalParagraph>

                <LegalHeading>5. Anonymous Usage Statistics</LegalHeading>
                <LegalParagraph>
                    To understand which parts of the game are used and where players get stuck, the application records anonymous usage events in our own database on Supabase. No third-party analytics or advertising service receives them.
                </LegalParagraph>
                <LegalBullet>What is recorded: screens opened, game modes started and finished, final scores, purchases of in-game items, the application version and platform, and a random identifier the application generates for itself (it is not a hardware or advertising identifier).</LegalBullet>
                <LegalBullet>If you are signed in, the server also links events to your account identifier. Guests are not linked to any account.</LegalBullet>
                <LegalBullet>Events are deleted automatically after 180 days.</LegalBullet>
                <LegalBullet>Crash reports: if the application crashes, it records the error text, a short technical trace, the screen you were on, the application version and your system version, in the same database and under the same switch. They are deleted after 90 days.</LegalBullet>
                <LegalBullet>You can switch collection off at any time in Options, under Privacy. The application then stops recording and discards events that were not yet sent.</LegalBullet>

                <LegalHeading>6. Sign-In, Friends and Notifications</LegalHeading>
                <LegalBullet>Sign-in: if you sign in with Discord or Google, or with an email address, our authentication provider (Supabase) receives your account identifier, display name, email address and profile picture from that service. We use them only to run your account.</LegalBullet>
                <LegalBullet>Friends: friend requests and accepted friendships are stored with your account, and friends can see your nickname and season score.</LegalBullet>
                <LegalBullet>Online status: while the app is open and you are signed in, it tells our server about once a minute that you are here. Only your accepted friends can see a green dot next to your name, for as long as the last signal is under two minutes old; nobody else can see it, and it is hidden when you choose "Nobody" for your profile in Options. The signal is deleted after two days.</LegalBullet>
                <LegalBullet>Player profile: other players can open your profile from leaderboards, rankings and friend lists. It shows your nickname, avatar, Versus rating, high scores, your wins, losses and draws in each game (the application sends these counters to your account so they survive a new phone) and your three rarest achievements. It never shows your email address, coins or purchases. In Options, under Privacy, you choose who can see these details: everyone, only friends, or nobody. Your nickname and avatar stay visible in leaderboards either way. Signed-in players only; guests have no profile data on our servers.</LegalBullet>
                <LegalBullet>Push notifications (Android and iOS apps): if you allow notifications, a push token that identifies your device is stored with your account and sent to Expo and Google Firebase Cloud Messaging, which deliver the messages. We send notifications about being overtaken on the leaderboard, a streak that is about to end, the end of a season and a friend inviting you to a match (only while the invitation is fresh, a few minutes). Switch them off in your device settings or in the app; the token is then removed.</LegalBullet>
                <LegalBullet>In the web version and in Discord, the same messages are shown inside the game when you open it.</LegalBullet>

                <LegalHeading>7. Security and Retention</LegalHeading>
                <LegalParagraph>
                    Data is stored on Supabase infrastructure with Row Level Security and encrypted connections. We keep your data while your account exists, and delete it when you ask us to.
                </LegalParagraph>

                <LegalHeading>8. Your Rights and Data Deletion</LegalHeading>
                <LegalParagraph>
                    You can delete your account and associated data yourself in the app (Profile, Delete account); the steps are also on blockerino.aionerdlin.me/delete-account. You can also ask us to access, correct or delete it by emailing nerdlinnut@gmail.com. Please write from the email linked to your account or include your player name so we can find it.
                </LegalParagraph>

                <LegalHeading>9. Children</LegalHeading>
                <LegalParagraph>
                    Blockerino is not directed at children under 13, and we do not knowingly collect their data. If you believe a child has provided data, contact us and we will remove it.
                </LegalParagraph>

                <LegalHeading>10. Policy Changes</LegalHeading>
                <LegalParagraph>
                    We may update this Privacy Policy as the game evolves. The current version is always on this page, with its effective date at the top. Continued use after a change means you accept the updated policy.
                </LegalParagraph>

                <LegalHeading>11. Contact</LegalHeading>
                <LegalParagraph>
                    Questions about privacy: nerdlinnut@gmail.com.
                </LegalParagraph>
        </LegalPage>
    );
}
