import React from 'react';
import LegalPage, { LegalBullet, LegalHeading, LegalParagraph } from '@/components/LegalPage';

export default function TermsOfService() {
    return (
        <LegalPage title="Terms of Service">
            <LegalParagraph>Effective Date: July 21, 2026</LegalParagraph>
                <LegalHeading>1. Acceptance of Terms</LegalHeading>
                <LegalParagraph>
                    By accessing, authenticating via Discord, or utilizing Blockerino in any capacity, you establish a binding agreement to adhere to these Terms of Service. If you do not consent to these stipulations in their entirety, you are expressly prohibited from utilizing the application and must immediately cease access.
                </LegalParagraph>
                
                <LegalHeading>2. Authorized Use and Conduct</LegalHeading>
                <LegalParagraph>
                    Blockerino is provisioned exclusively for personal, non-commercial entertainment purposes. As a condition of your use, you agree to comply with all applicable Discord Community Guidelines and agree that you shall not under any circumstances:
                </LegalParagraph>
                <LegalBullet>Employ exploits, macros, automated scripts, or third-party modifications designed to grant an unfair competitive advantage or manipulate the Elo ranking system.</LegalBullet>
                <LegalBullet>Engage in reverse engineering, packet sniffing, or any attempt to disrupt, compromise, or over-burden the underlying server architecture.</LegalBullet>
                <LegalBullet>Utilize the application infrastructure for unauthorized data scraping, abuse, or any illicit activities.</LegalBullet>
                
                <LegalHeading>3. Disclaimer of Warranties</LegalHeading>
                <LegalParagraph>
                    The application and its underlying services are provided on a strictly "AS IS" and "AS AVAILABLE" basis, without express or implied warranties of any kind. The developer disclaims all warranties, including but not limited to merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee absolute system availability, fault tolerance, or immunity from cryptographic or infrastructural vulnerabilities.
                </LegalParagraph>
                
                <LegalHeading>4. Limitation of Liability</LegalHeading>
                <LegalParagraph>
                    To the maximum extent permitted by applicable law, in no event shall the developer be held liable for any direct, indirect, incidental, punitive, or consequential damages (including, without limitation, loss of data, reputation, or access) arising out of or in any way connected with the utilization or performance of Blockerino, even if previously advised of the possibility of such damages.
                </LegalParagraph>
                
                <LegalHeading>5. Intellectual Property</LegalHeading>
                <LegalParagraph>
                    Blockerino, including its source code, game design, artwork, audio, text and name, is the property of its developer and is protected by copyright. All rights are reserved. You receive a personal, non-exclusive, revocable right to play the officially published game; you may not copy, modify, redistribute, host or reverse engineer the application or use its name, branding or assets commercially without written permission. Third-party fonts and libraries remain under their own licenses; see the Licenses screen in Options.
                </LegalParagraph>

                <LegalHeading>6. User Content</LegalHeading>
                <LegalParagraph>
                    Nicknames, avatars and similar content you provide must not be unlawful, hateful, impersonate another person or infringe the rights of others. You keep your rights in your content and grant the developer a limited, worldwide, royalty-free right to store and display it inside the game (for example on leaderboards and in friend lists). We may remove content or rename accounts that break these rules.
                </LegalParagraph>

                <LegalHeading>7. Virtual Coins and Items</LegalHeading>
                <LegalParagraph>
                    Coins, cosmetics and other in-game items have no monetary value, cannot be exchanged for money or transferred outside the game, and remain available only for as long as the service operates. We may correct balances, scores and ratings that result from errors, exploits or abuse.
                </LegalParagraph>

                <LegalHeading>8. Modifications and Severability</LegalHeading>
                <LegalParagraph>
                    We reserve the unilateral right to amend these Terms of Service at any given time without prior explicit notification. Continued utilization of the service following modifications constitutes binding acceptance of the updated terms. If any provision of these terms is deemed unlawful or unenforceable, that provision shall be deemed severable and shall not affect the validity of the remaining provisions.
                </LegalParagraph>
            
        </LegalPage>
    );
}
