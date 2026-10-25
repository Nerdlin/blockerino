// Text of the push notifications, in the player's language. Pure code on purpose (no imports), so the
// Edge Function and the Jest tests can both load it.

export type Lang = "en" | "ru";
export type NotificationKind = "overtaken" | "streak_risk" | "season_ending" | "invite";

export interface PushMessage {
	title: string;
	body: string;
}

const BOARD_NAMES: Record<Lang, Record<string, string>> = {
	en: { classic: "Classic 8×8", chaos: "Chaos 10×10" },
	ru: { classic: "Classic 8×8", chaos: "Chaos 10×10" },
};

function num(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim().slice(0, 30) : fallback;
}

/** Null for a kind this version does not know, so a new server-side kind never crashes an old sender. */
export function buildMessage(kind: string, payload: Record<string, unknown>, lang: Lang): PushMessage | null {
	const board = BOARD_NAMES[lang][str(payload.board, "classic")] ?? BOARD_NAMES[lang].classic;

	if (kind === "invite") {
		const from = str(payload.from, lang === "ru" ? "Друг" : "A friend");
		const mode = BOARD_NAMES[lang][str(payload.mode, "classic")] ?? BOARD_NAMES[lang].classic;
		return lang === "ru"
			? { title: "Приглашение в 1v1", body: `${from} зовёт вас сыграть: ${mode}. Откройте игру, чтобы принять.` }
			: { title: "1v1 invite", body: `${from} invites you to a ${mode} match. Open the game to accept.` };
	}

	if (kind === "overtaken") {
		const by = str(payload.by, lang === "ru" ? "Игрок" : "A player");
		const theirs = num(payload.by_score);
		const mine = num(payload.score);
		return lang === "ru"
			? { title: "Вас обогнали!", body: `${by} превзошёл ваш результат в ${board}: ${theirs} против ${mine}. Вернём лидерство?` }
			: { title: "You were overtaken!", body: `${by} passed your ${board} score: ${theirs} vs ${mine}. Take it back!` };
	}

	if (kind === "streak_risk") {
		const streak = num(payload.streak);
		const reward = num(payload.reward);
		return lang === "ru"
			? { title: `Серия в ${streak} дн. под угрозой`, body: `Зайдите сегодня и заберите +${reward} монет.` }
			: { title: `Your ${streak}-day streak is at risk`, body: `Play today and collect +${reward} coins.` };
	}

	if (kind === "season_ending") {
		const rank = num(payload.rank, 1);
		const gap = num(payload.to_top10);
		if (lang === "ru") {
			return {
				title: "Сезон заканчивается завтра",
				body: rank <= 10
					? `Вы #${rank} в ${board}. Удержите место в топ-10!`
					: `Вы #${rank} в ${board}. До топ-10 не хватает ${gap} очков.`,
			};
		}
		return {
			title: "Season ends tomorrow",
			body: rank <= 10
				? `You are #${rank} in ${board}. Defend your top-10 place!`
				: `You are #${rank} in ${board}. ${gap} points to reach the top 10.`,
		};
	}

	return null;
}
