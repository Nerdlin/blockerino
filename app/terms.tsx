import React from 'react';
import LegalPage, { LegalBullet, LegalHeading, LegalParagraph } from '@/components/LegalPage';

export default function TermsOfService() {
    return (
        <LegalPage title="Terms of Service">
                <LegalParagraph>Effective Date: October 27, 2026</LegalParagraph>
                <LegalHeading>1. Acceptance of Terms</LegalHeading>
                <LegalParagraph>
                    By signing in with Discord, Google or email, or by using Blockerino in any other way, you agree to these Terms of Service. If you do not agree, do not use the application.
                </LegalParagraph>

                <LegalHeading>2. Authorized Use and Conduct</LegalHeading>
                <LegalParagraph>
                    Blockerino is provided for personal, non-commercial entertainment. You agree to follow the Discord Community Guidelines and not to:
                </LegalParagraph>
                <LegalBullet>Use exploits, macros, bots, scripts or modifications to gain an unfair advantage or manipulate Elo, leaderboards or season rankings.</LegalBullet>
                <LegalBullet>Reverse engineer, packet sniff, or try to disrupt or overload our servers.</LegalBullet>
                <LegalBullet>Scrape data or use the service for abuse or any unlawful purpose.</LegalBullet>
                <LegalBullet>Choose offensive or impersonating names.</LegalBullet>
                <LegalParagraph>
                    We may remove scores, reset ratings or rewards, or suspend or delete accounts that break these rules.
                </LegalParagraph>

                <LegalHeading>3. Accounts</LegalHeading>
                <LegalParagraph>
                    You are responsible for keeping your sign-in credentials safe and for activity on your account. Tell us at the contact below if you think your account was compromised.
                </LegalParagraph>

                <LegalHeading>4. Virtual Items, Rewards and Seasons</LegalHeading>
                <LegalParagraph>
                    Cosmetics, titles, coins and other in-game rewards are virtual, have no cash value, and cannot be exchanged for money. Seasons, ratings and leaderboards may be reset, and game modes, rewards and features may change or be removed at any time.
                </LegalParagraph>
                <LegalParagraph>
                    We may correct balances, scores and ratings that result from errors, exploits or abuse.
                </LegalParagraph>

                <LegalHeading>5. Intellectual Property</LegalHeading>
                <LegalParagraph>
                    Blockerino, including its source code, game design, artwork, audio, text and name, is the property of its developer and is protected by copyright. All rights are reserved. You receive a personal, non-exclusive, revocable right to play the officially published game; you may not copy, modify, redistribute, host or reverse engineer the application or use its name, branding or assets commercially without written permission. Third-party fonts and libraries remain under their own licenses; see the Licenses screen in Options.
                </LegalParagraph>

                <LegalHeading>6. User Content</LegalHeading>
                <LegalParagraph>
                    Nicknames, avatars and similar content you provide must not be unlawful, hateful, impersonate another person or infringe the rights of others. You keep your rights in your content and grant the developer a limited, worldwide, royalty-free right to store and display it inside the game (for example on leaderboards and in friend lists). We may remove content or rename accounts that break these rules.
                </LegalParagraph>

                <LegalHeading>7. Disclaimer of Warranties</LegalHeading>
                <LegalParagraph>
                    The application and its services are provided on an AS IS and AS AVAILABLE basis, without warranties of any kind, including merchantability, fitness for a particular purpose and non-infringement. We do not guarantee uninterrupted availability or that data will never be lost.
                </LegalParagraph>

                <LegalHeading>8. Limitation of Liability</LegalHeading>
                <LegalParagraph>
                    To the maximum extent permitted by law, the developer is not liable for any direct, indirect, incidental or consequential damages, including loss of data, progress or access, arising from the use of Blockerino.
                </LegalParagraph>

                <LegalHeading>9. Privacy</LegalHeading>
                <LegalParagraph>
                    How we handle your data is described in our Privacy Policy.
                </LegalParagraph>

                <LegalHeading>10. Modifications and Severability</LegalHeading>
                <LegalParagraph>
                    We may update these Terms at any time. Continued use after changes means you accept them. If any provision is found unenforceable, the remaining provisions stay in effect.
                </LegalParagraph>

                <LegalHeading>11. Contact</LegalHeading>
                <LegalParagraph>
                    Questions about these Terms: nerdlinnut@gmail.com.
                </LegalParagraph>
        </LegalPage>
    );
}
