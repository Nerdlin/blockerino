import React from 'react';
import LegalPage, { LegalBullet, LegalHeading, LegalParagraph } from '@/components/LegalPage';

// The page Google Play asks for ("how to delete your account and data"). Linked from the store listing and the privacy policy.
export default function DeleteAccount() {
    return (
        <LegalPage title="Delete your account">
            <LegalParagraph>
                You can delete your Blockerino account and the data that belongs to it at any time.
            </LegalParagraph>

            <LegalHeading>In the app (fastest)</LegalHeading>
            <LegalBullet>Open Blockerino and sign in.</LegalBullet>
            <LegalBullet>Tap the profile icon at the top of the main menu.</LegalBullet>
            <LegalBullet>Scroll to the bottom and tap "Delete account", then confirm.</LegalBullet>
            <LegalParagraph>
                The deletion happens right away and cannot be undone. This works in the Android app, in the browser and in the Discord Activity.
            </LegalParagraph>

            <LegalHeading>By email</LegalHeading>
            <LegalParagraph>
                If you cannot open the app, write to nerdlinnut@gmail.com from the email linked to your account (or give your player name). We delete the account within 30 days and confirm by email.
            </LegalParagraph>

            <LegalHeading>What is deleted</LegalHeading>
            <LegalBullet>Your profile: nickname, avatar, scores, Elo rating, coins, purchases and equipped items.</LegalBullet>
            <LegalBullet>Your sign-in (email, Google or Discord link), friends and friend requests, profile privacy choice, online status, per-game records, achievements, daily quests, notifications and push tokens.</LegalBullet>
            <LegalBullet>Your place in leaderboards and the More Games rating table, season scores and rewards, usage statistics and crash reports linked to your account.</LegalBullet>

            <LegalHeading>What stays</LegalHeading>
            <LegalBullet>Finished season results stay in the public season history, with your name replaced by "Deleted player".</LegalBullet>
            <LegalBullet>Match history of other players keeps an anonymous entry that no longer points to you.</LegalBullet>
            <LegalBullet>Scores and settings stored on your own device stay there until you clear the app data or uninstall.</LegalBullet>
        </LegalPage>
    );
}
