import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Static HTML shell for the web build. Search engines and AI crawlers do not run the game's JavaScript,
// so the structured data and a plain-text summary live here, in the HTML they actually read.
const structuredData = {
	'@context': 'https://schema.org',
	'@type': 'VideoGame',
	name: 'Blockerino',
	alternateName: 'Blockerino by Nerdlin',
	url: 'https://blockerino.aionerdlin.me/',
	description: 'Free pixel block puzzle by indie developer Nerdlin. Clear rows and columns, duel friends 1v1 in real time, beat monthly leaderboards, and play chess, Sea Battle (Battleship), Durak and tic-tac-toe. Runs in the browser, on Android and as a Discord Activity.',
	genre: ['Puzzle', 'Block puzzle', 'Multiplayer'],
	gamePlatform: ['Web browser', 'Android', 'Discord Activity'],
	applicationCategory: 'Game',
	operatingSystem: 'Android, Web',
	playMode: ['SinglePlayer', 'MultiPlayer'],
	inLanguage: ['en', 'ru'],
	isAccessibleForFree: true,
	offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
	image: 'https://blockerino.aionerdlin.me/social-preview.png',
	author: { '@type': 'Person', name: 'Nerdlin', url: 'https://github.com/Nerdlin' },
	sameAs: ['https://github.com/Nerdlin/blockerino'],
};

export default function Root({ children }: PropsWithChildren) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta httpEquiv="X-UA-Compatible" content="IE=edge" />
				<ScrollViewStyleReset />
				<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
			</head>
			<body>
				{children}
				<noscript>
					<h1>Blockerino: pixel block puzzle with 1v1 duels</h1>
					<p>Blockerino is a free pixel block puzzle game by indie developer Nerdlin. Clear rows and columns, climb monthly leaderboards and duel friends 1v1 in real time. Also includes chess, Sea Battle, Durak and tic-tac-toe. Play in the browser, on Android or as a Discord Activity. JavaScript is required to play.</p>
				</noscript>
			</body>
		</html>
	);
}
