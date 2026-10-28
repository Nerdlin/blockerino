import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import type { ExtraGameCosmetics } from "./cosmetics";
import { DurakCardView } from "./DurakGame";

// Cards that fly across the Durak table: dealt from the deck, swept to the discard pile ("бито") or picked up by the
// player who could not beat them. They are drawn above the table and removed when they land, so the game state itself
// never waits for an animation.

export interface DurakFlight {
	id: number;
	card: string;
	from: { x: number; y: number };
	to: { x: number; y: number };
	delay: number;
	/** Fade out while landing (discard pile, pick-up) instead of staying visible until removed. */
	fade?: boolean;
	spin?: number;
}

const CARD_W = 54;
const CARD_H = 76;
const FLIGHT_MS = 420;

function Flight({ flight, trump, cosmetics, onDone }: { flight: DurakFlight; trump: string; cosmetics: ExtraGameCosmetics; onDone: (id: number) => void }) {
	const progress = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const animation = Animated.timing(progress, { toValue: 1, duration: FLIGHT_MS, delay: flight.delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
		animation.start(({ finished }) => {
			if (finished) onDone(flight.id);
		});
		return () => animation.stop();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const dx = flight.to.x - flight.from.x;
	const dy = flight.to.y - flight.from.y;
	return (
		<Animated.View
			pointerEvents="none"
			style={{
				position: "absolute",
				left: flight.from.x - CARD_W / 2,
				top: flight.from.y - CARD_H / 2,
				zIndex: 200,
				opacity: progress.interpolate({ inputRange: [0, 0.001, 0.75, 1], outputRange: flight.fade ? [0, 1, 1, 0] : [0, 1, 1, 1] }),
				transform: [
					{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
					{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
					{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${flight.spin ?? 0}deg`] }) },
					{ scale: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1, 0.9] }) },
				],
			}}
		>
			<DurakCardView card={flight.card} trump={trump} cosmetics={cosmetics} />
		</Animated.View>
	);
}

export function DurakFlightLayer({ flights, trump, cosmetics, onDone }: { flights: DurakFlight[]; trump: string; cosmetics: ExtraGameCosmetics; onDone: (id: number) => void }) {
	return (
		<>
			{flights.map((flight) => (
				<Flight key={flight.id} flight={flight} trump={trump} cosmetics={cosmetics} onDone={onDone} />
			))}
		</>
	);
}
