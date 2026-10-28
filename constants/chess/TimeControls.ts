// Time controls for online chess. Every control belongs to one class and every class has its own rating,
// as on chess.com: "1+1" is bullet, "3+2" blitz, "15+10" rapid.

export type TimeClass = "bullet" | "blitz" | "rapid";

export interface TimeControl {
	/** "base+increment" in seconds, e.g. "180+2". Stable: it is stored with matches. */
	id: string;
	baseSeconds: number;
	incrementSeconds: number;
	timeClass: TimeClass;
}

export const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid"];

/** Estimated game length (base + 40 increments) decides the class: under 3 min bullet, under 8 min blitz, else rapid. */
export function classifyTimeControl(baseSeconds: number, incrementSeconds: number): TimeClass {
	const estimated = baseSeconds + 40 * incrementSeconds;
	if (estimated < 180) return "bullet";
	if (estimated < 480) return "blitz";
	return "rapid";
}

export function makeTimeControl(baseSeconds: number, incrementSeconds: number): TimeControl {
	return { id: `${baseSeconds}+${incrementSeconds}`, baseSeconds, incrementSeconds, timeClass: classifyTimeControl(baseSeconds, incrementSeconds) };
}

/** The presets offered in the lobby, three per class. */
export const TIME_CONTROLS: TimeControl[] = [
	makeTimeControl(60, 0),
	makeTimeControl(60, 1),
	makeTimeControl(120, 1),
	makeTimeControl(180, 0),
	makeTimeControl(180, 2),
	makeTimeControl(300, 0),
	makeTimeControl(600, 0),
	makeTimeControl(900, 10),
	makeTimeControl(1800, 0),
];

export const DEFAULT_TIME_CONTROL = TIME_CONTROLS[4];

export function timeControlsOf(timeClass: TimeClass): TimeControl[] {
	return TIME_CONTROLS.filter((control) => control.timeClass === timeClass);
}

/** Parses "180+2"; null for anything that is not a sane control (so a hostile room payload cannot set 0 or a year). */
export function parseTimeControl(id: unknown): TimeControl | null {
	if (typeof id !== "string") return null;
	const match = /^(\d{1,5})\+(\d{1,3})$/.exec(id);
	if (!match) return null;
	const base = Number(match[1]);
	const increment = Number(match[2]);
	if (base < 30 || base > 10800 || increment > 180) return null;
	return makeTimeControl(base, increment);
}

/** "1+1", "3 min", "15+10". */
export function formatTimeControl(control: TimeControl): string {
	const minutes = control.baseSeconds / 60;
	if (control.incrementSeconds === 0) {
		return Number.isInteger(minutes) ? `${minutes} min` : `${control.baseSeconds} s`;
	}
	return `${Number.isInteger(minutes) ? minutes : `${control.baseSeconds}s`}+${control.incrementSeconds}`;
}

/** Clock face: "2:05"; with tenths under ten seconds ("0:07.4") so a bullet player can see it run. */
export function formatClock(ms: number): string {
	const safe = Math.max(0, ms);
	if (safe < 10000) {
		const tenths = Math.floor(safe / 100) % 10;
		return `0:${String(Math.floor(safe / 1000)).padStart(2, "0")}.${tenths}`;
	}
	const totalSeconds = Math.ceil(safe / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
		: `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Shown under "More time controls", like chess.com's longer list. */
export const EXTRA_TIME_CONTROLS: TimeControl[] = [
	makeTimeControl(30, 0),
	makeTimeControl(120, 0),
	makeTimeControl(300, 2),
	makeTimeControl(600, 5),
	makeTimeControl(1200, 0),
	makeTimeControl(3600, 0),
];

export const CUSTOM_MINUTES = { min: 1, max: 120 };
export const CUSTOM_BONUS_SECONDS = { min: 0, max: 60 };

/** A time control from the two sliders of the custom picker; both values are clamped to what the server accepts. */
export function customTimeControl(minutes: number, bonusSeconds: number): TimeControl {
	const m = Math.max(CUSTOM_MINUTES.min, Math.min(CUSTOM_MINUTES.max, Math.round(minutes)));
	const b = Math.max(CUSTOM_BONUS_SECONDS.min, Math.min(CUSTOM_BONUS_SECONDS.max, Math.round(bonusSeconds)));
	return makeTimeControl(m * 60, b);
}
