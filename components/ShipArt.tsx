import { memo } from "react";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

// Hand-drawn "pen on squared paper" warships for Sea Battle. One SVG per ship,
// drawn in a horizontal 10-units-per-cell space (bow on the left) and rotated
// for vertical ships, so it scales with whatever cell size the board uses.

interface ShipArtProps {
	length: number;
	orientation: "h" | "v";
	selected?: boolean;
}

const INK = "#5B21B6";
const INK_SOFT = "#7C3AED";
const PAPER_FILL = "#DDD6FE";
const DECK_FILL = "#F5F3FF";

const SELECTED_INK = "#B45309";
const SELECTED_SOFT = "#D97706";
const SELECTED_FILL = "#FDE68A";
const SELECTED_DECK = "#FFFBEB";

function turretPositions(length: number, width: number): number[] {
	if (length <= 2) return [width * 0.58];
	if (length === 3) return [width * 0.4, width * 0.68];
	return [width * 0.3, width * 0.5, width * 0.7];
}

function ShipDrawing({ length, selected }: { length: number; selected: boolean }) {
	const ink = selected ? SELECTED_INK : INK;
	const soft = selected ? SELECTED_SOFT : INK_SOFT;
	const fill = selected ? SELECTED_FILL : PAPER_FILL;
	const deck = selected ? SELECTED_DECK : DECK_FILL;
	const width = length * 10;

	if (length === 1) {
		// Small boat: a shield with a round emblem, like in the paper game.
		return (
			<G>
				<Path d="M2 1.6 H8 V5.2 Q8 7.8 5 9 Q2 7.8 2 5.2 Z" fill={fill} stroke={ink} strokeWidth={0.9} strokeLinejoin="round" />
				<Circle cx={5} cy={4.4} r={1.7} fill={deck} stroke={soft} strokeWidth={0.6} />
				<Circle cx={5} cy={4.4} r={0.5} fill={ink} />
				<Line x1={3.4} y1={7} x2={6.6} y2={7} stroke={soft} strokeWidth={0.5} strokeLinecap="round" />
			</G>
		);
	}

	const hull = `M1 5 L3.4 1.8 L${width - 1.2} 1.8 L${width - 0.8} 2.6 L${width - 0.8} 7.4 L${width - 1.2} 8.2 L3.4 8.2 Z`;
	const ribs: number[] = [];
	for (let x = 14; x < width - 4; x += 10) ribs.push(x);

	return (
		<G>
			<Path d={hull} fill={fill} stroke={ink} strokeWidth={0.9} strokeLinejoin="round" />
			{ribs.map((x) => (
				<G key={x}>
					<Line x1={x} y1={2.6} x2={x} y2={3.6} stroke={soft} strokeWidth={0.45} strokeLinecap="round" />
					<Line x1={x} y1={6.4} x2={x} y2={7.4} stroke={soft} strokeWidth={0.45} strokeLinecap="round" />
				</G>
			))}
			<Rect x={4.6} y={3.7} width={width - 8.6} height={2.6} rx={0.6} fill={deck} stroke={soft} strokeWidth={0.5} />
			<Circle cx={3.6} cy={5} r={0.7} fill={ink} />
			{turretPositions(length, width).map((x) => (
				<G key={x}>
					<Circle cx={x} cy={5} r={1.7} fill={fill} stroke={ink} strokeWidth={0.7} />
					<Circle cx={x} cy={5} r={0.55} fill={ink} />
				</G>
			))}
			{length >= 4 ? <Rect x={width - 4.4} y={4.2} width={1.8} height={1.6} fill={ink} /> : null}
		</G>
	);
}

function ShipArtComponent({ length, orientation, selected = false }: ShipArtProps) {
	const horizontal = orientation === "h" || length === 1;
	const viewBox = horizontal ? `0 0 ${length * 10} 10` : `0 0 10 ${length * 10}`;

	return (
		<Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="none">
			{horizontal ? (
				<ShipDrawing length={length} selected={selected} />
			) : (
				<G transform="translate(10 0) rotate(90)">
					<ShipDrawing length={length} selected={selected} />
				</G>
			)}
		</Svg>
	);
}

export default memo(ShipArtComponent);
