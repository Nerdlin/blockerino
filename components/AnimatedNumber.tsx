import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleProp, Text, TextStyle } from "react-native";

// A number that counts up (or down) to its new value and gives a small pop when it changes, so coins, scores and
// stats feel alive. The first value counts up from zero when the screen opens.
export default function AnimatedNumber({
	value,
	style,
	duration = 650,
}: {
	value: number;
	style?: StyleProp<TextStyle>;
	duration?: number;
}) {
	const [shown, setShown] = useState(0);
	const shownRef = useRef(0);
	const pop = useRef(new Animated.Value(1)).current;
	const first = useRef(true);

	useEffect(() => {
		const from = shownRef.current;
		if (from === value) return;
		const progress = new Animated.Value(0);
		const listener = progress.addListener(({ value: p }) => {
			const next = Math.round(from + (value - from) * p);
			shownRef.current = next;
			setShown(next);
		});
		const count = Animated.timing(progress, {
			toValue: 1,
			duration: first.current ? duration : Math.min(duration, 450),
			easing: Easing.out(Easing.cubic),
			useNativeDriver: false,
		});
		if (!first.current) {
			Animated.sequence([
				Animated.timing(pop, { toValue: 1.22, duration: 120, useNativeDriver: true }),
				Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
			]).start();
		}
		first.current = false;
		count.start(() => {
			shownRef.current = value;
			setShown(value);
		});
		return () => {
			progress.removeListener(listener);
			count.stop();
		};
	}, [value, duration, pop]);

	return <Animated.Text style={[style, { transform: [{ scale: pop }] }]}>{shown}</Animated.Text>;
}
