import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { CARD_SKINS, type ExtraGameCosmetics } from "./cosmetics";
import { DurakCardView } from "./DurakGame";
import { styles } from "./styles";

// Cards that fly across the Durak table: dealt from the deck, swept to the discard pile ("бито") or picked up by the
// player who could not beat them. They are drawn above the table and removed when they land, so the game state itself
// never waits for an animation. The layer keeps its own list: launching or landing a card re-renders only the layer,
// never the whole table (a deal sends a dozen cards at once, and a table re-render per landing made it stutter).

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

export interface DurakFlightLayerHandle {
	launch: (flights: DurakFlight[]) => void;
}

const CARD_W = 54;
const CARD_H = 76;
const FLIGHT_MS = 380;
const MAX_IN_AIR = 16;

/** A card back without the suit icon: a dozen SVG icons moving at once is what made the deal janky on phones. */
function FlightBack({ cosmetics }: { cosmetics: ExtraGameCosmetics }) {
	const skin = CARD_SKINS[cosmetics.cardSkin];
	return <View style={[styles.playingCard, { backgroundColor: skin.backBg, borderColor: skin.backBorder }]} />;
}

const Flight = memo(function Flight({ flight, trump, cosmetics, onDone }: { flight: DurakFlight; trump: string; cosmetics: ExtraGameCosmetics; onDone: (id: number) => void }) {
	const progress = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const animation = Animated.timing(progress, { toValue: 1, duration: FLIGHT_MS, delay: flight.delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
		animation.start(() => onDone(flight.id));
		return () => animation.stop();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const dx = flight.to.x - flight.from.x;
	const dy = flight.to.y - flight.from.y;
	return (
		<Animated.View
			pointerEvents="none"
			renderToHardwareTextureAndroid
			style={{
				position: "absolute",
				left: flight.from.x - CARD_W / 2,
				top: flight.from.y - CARD_H / 2,
				zIndex: 200,
				opacity: progress.interpolate({ inputRange: [0, 0.001, 0.7, 1], outputRange: flight.fade ? [0, 1, 1, 0] : [0, 1, 1, 1] }),
				transform: [
					{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
					{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
					{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${flight.spin ?? 0}deg`] }) },
					{ scale: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.85, 1, 0.92] }) },
				],
			}}
		>
			{flight.card === "back" ? <FlightBack cosmetics={cosmetics} /> : <DurakCardView card={flight.card} trump={trump} cosmetics={cosmetics} />}
		</Animated.View>
	);
});

export const DurakFlightLayer = forwardRef<DurakFlightLayerHandle, { trump: string; cosmetics: ExtraGameCosmetics }>(function DurakFlightLayer({ trump, cosmetics }, ref) {
	const [flights, setFlights] = useState<DurakFlight[]>([]);
	const onDone = useCallback((id: number) => setFlights((current) => current.filter((flight) => flight.id !== id)), []);
	useImperativeHandle(ref, () => ({
		launch: (added) => setFlights((current) => [...current, ...added].slice(-MAX_IN_AIR)),
	}), []);
	return (
		<>
			{flights.map((flight) => (
				<Flight key={flight.id} flight={flight} trump={trump} cosmetics={cosmetics} onDone={onDone} />
			))}
		</>
	);
});
