import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import SegmentedControl from "./SegmentedControl";
import PixelLoader from "./PixelLoader";
import { cssColors } from "@/constants/Color";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useSetAppState } from "@/hooks/useAppState";
import {
	adminApi,
	useAdminWinButton,
	useIsAdmin,
	type AdminLogRow,
	type AdminOverview,
	type AdminPlayer,
	type AdminSeasonRow,
	type AndroidVersionConfig,
} from "@/constants/Admin";

// The administrator's own screen. Only the admin account sees the entry in Settings, and the server refuses every
// call from anyone else. The texts are Russian only: nobody else ever opens it.

type Tab = "overview" | "players" | "season" | "version" | "log";

const TABS: { key: Tab; label: string }[] = [
	{ key: "overview", label: "Обзор" },
	{ key: "players", label: "Игроки" },
	{ key: "season", label: "Сезон" },
	{ key: "version", label: "Версия" },
	{ key: "log", label: "Журнал" },
];

const ACTION_LABELS: Record<string, string> = {
	adjust_coins: "Монеты",
	reset_record: "Сброс рекорда",
	set_android_version: "Версия Android",
};

function formatDate(value: string | null | undefined): string {
	if (!value) return "—";
	const date = new Date(value);
	return `${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0, 5)}`;
}

export default function AdminPanel() {
	const { currentTheme } = useTheme();
	const [, , popAppState] = useSetAppState();
	const isAdmin = useIsAdmin();
	const [tab, setTab] = useState<Tab>("overview");
	const handleBack = useCallback(() => popAppState(), [popAppState]);
	useEscapeKey(handleBack);

	return (
		<SimplePopupView style={[{ justifyContent: "flex-start", backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
			<View style={styles.topBar}>
				<StylizedButton text="Назад" onClick={handleBack} backgroundColor={cssColors.spaceGray} style={{ minWidth: 100 }} />
				<Text style={[styles.title, { color: currentTheme.textPrimary }]}>Админ-панель</Text>
			</View>
			{!isAdmin ? (
				<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>Только для администратора.</Text>
			) : (
				<>
					<SegmentedControl items={TABS.map((item) => ({ key: item.key, label: item.label }))} value={tab} onChange={setTab} small />
					<View style={styles.body}>
						{tab === "overview" && <OverviewTab />}
						{tab === "players" && <PlayersTab />}
						{tab === "season" && <SeasonTab />}
						{tab === "version" && <VersionTab />}
						{tab === "log" && <LogTab />}
					</View>
				</>
			)}
		</SimplePopupView>
	);
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const reload = useCallback(() => {
		setLoading(true);
		setError(null);
		load().then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
	useEffect(() => { reload(); }, [reload]);
	return { data, error, loading, reload };
}

function Stat({ label, value }: { label: string; value: string | number }) {
	const { currentTheme } = useTheme();
	return (
		<View style={[styles.stat, { borderColor: currentTheme.textSecondary }]}>
			<Text style={[styles.statValue, { color: currentTheme.accent }]}>{value}</Text>
			<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]}>{label}</Text>
		</View>
	);
}

function OverviewTab() {
	const { currentTheme } = useTheme();
	const { data, error, loading, reload } = useLoad<AdminOverview>(adminApi.overview, []);
	const [winButton, setWinButton] = useAdminWinButton();
	return (
		<View style={{ gap: 12 }}>
			{loading && <PixelLoader size="small" color={currentTheme.textPrimary} />}
			{error && <Text style={styles.error}>{error}</Text>}
			{data && (
				<View style={styles.statGrid}>
					<Stat label="Игроков всего" value={data.players} />
					<Stat label="С аккаунтом" value={data.accounts} />
					<Stat label="Новых сегодня" value={data.new_today} />
					<Stat label="Активны сегодня" value={data.active_today} />
					<Stat label="Активны за неделю" value={data.active_week} />
					<Stat label="В сезоне" value={data.season_players} />
					<Stat label="Дуэлей сегодня" value={data.duels_today} />
					<Stat label="Монет у всех" value={data.coins_total} />
				</View>
			)}
			<View style={[styles.row, styles.card, { borderColor: currentTheme.textSecondary }]}>
				<View style={{ flex: 1 }}>
					<Text style={[styles.label, { color: currentTheme.textPrimary }]}>Кнопка «Победа» в играх с ботом</Text>
					<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>Сразу засчитывает вам победу. Только для проверок, видна только вам.</Text>
				</View>
				<Switch value={winButton} onValueChange={setWinButton} />
			</View>
			<StylizedButton text="Обновить" onClick={reload} backgroundColor={cssColors.spaceGray} />
		</View>
	);
}

function PlayersTab() {
	const { currentTheme } = useTheme();
	const [query, setQuery] = useState("");
	const [submitted, setSubmitted] = useState("");
	const { data, error, loading, reload } = useLoad<AdminPlayer[]>(() => adminApi.findPlayers(submitted), [submitted]);
	const [selected, setSelected] = useState<AdminPlayer | null>(null);

	if (selected) {
		return <PlayerCard player={selected} onBack={() => { setSelected(null); reload(); }} />;
	}
	return (
		<View style={{ gap: 10 }}>
			<View style={styles.row}>
				<TextInput
					value={query}
					onChangeText={setQuery}
					onSubmitEditing={() => setSubmitted(query)}
					placeholder="Ник или его часть"
					placeholderTextColor={currentTheme.textSecondary}
					style={[styles.input, { flex: 1, color: currentTheme.textPrimary, borderColor: currentTheme.textSecondary }]}
					autoCapitalize="none"
				/>
				<StylizedButton text="Найти" onClick={() => setSubmitted(query)} backgroundColor={currentTheme.buttonPrimary} style={{ minWidth: 0, paddingHorizontal: 14 }} />
			</View>
			{loading && <PixelLoader size="small" color={currentTheme.textPrimary} />}
			{error && <Text style={styles.error}>{error}</Text>}
			{data?.length === 0 && <Text style={[styles.muted, { color: currentTheme.textSecondary }]}>Никого не нашлось.</Text>}
			{data?.map((player) => (
				<Pressable key={player.id} onPress={() => setSelected(player)} style={[styles.card, { borderColor: currentTheme.textSecondary }]}>
					<Text style={[styles.label, { color: currentTheme.textPrimary }]}>{player.player_name}{player.is_admin ? "  ★" : ""}</Text>
					<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>
						{player.coins} мон. · Elo {player.elo} · Классика {player.highscore_classic} · Хаос {player.highscore_chaos}
					</Text>
					<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>
						{player.has_account ? (player.login_providers?.join(", ") || "аккаунт") : "гость"} · был {formatDate(player.last_seen)}
					</Text>
				</Pressable>
			))}
		</View>
	);
}

function PlayerCard({ player, onBack }: { player: AdminPlayer; onBack: () => void }) {
	const { currentTheme } = useTheme();
	const [coins, setCoins] = useState(player.coins);
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async (task: () => Promise<string>) => {
		if (busy) return;
		setBusy(true);
		setMessage(null);
		try {
			setMessage(await task());
		} catch (e) {
			setMessage(`Ошибка: ${(e as Error).message}`);
		} finally {
			setBusy(false);
		}
	};
	const adjust = (delta: number) => run(async () => {
		const result = await adminApi.adjustCoins(player.id, delta, reason || "админ-панель");
		setCoins(result.coins);
		return `Теперь ${result.coins} монет`;
	});
	const typed = Math.trunc(Number(amount));

	return (
		<View style={{ gap: 10 }}>
			<Pressable onPress={onBack}><Text style={[styles.link, { color: currentTheme.accent }]}>‹ К списку</Text></Pressable>
			<Text style={[styles.title, { color: currentTheme.textPrimary, textAlign: "left" }]}>{player.player_name}</Text>
			<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>
				Монеты {coins} · Elo {player.elo} · серия {player.streak_count}{"\n"}
				Классика {player.highscore_classic} · Хаос {player.highscore_chaos}{"\n"}
				Вход: {player.login_providers?.join(", ") || "—"}, последний {formatDate(player.last_login_at)}{"\n"}
				С нами с {formatDate(player.created_at)}
			</Text>

			<Text style={[styles.label, { color: currentTheme.textPrimary }]}>Монеты</Text>
			<View style={[styles.row, { flexWrap: "wrap" }]}>
				{[100, 1000, 10000].map((value) => (
					<StylizedButton key={value} text={`+${value}`} onClick={() => void adjust(value)} backgroundColor="#16A34A" style={styles.smallButton} textStyle={styles.smallText} disabled={busy} />
				))}
			</View>
			<View style={styles.row}>
				<TextInput value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" placeholder="сумма, можно с минусом" placeholderTextColor={currentTheme.textSecondary}
					style={[styles.input, { flex: 1, color: currentTheme.textPrimary, borderColor: currentTheme.textSecondary }]} />
				<StylizedButton text="Применить" onClick={() => { if (typed) void adjust(typed); }} backgroundColor={currentTheme.buttonPrimary} style={styles.smallButton} textStyle={styles.smallText} disabled={busy || !typed} />
			</View>
			<TextInput value={reason} onChangeText={setReason} placeholder="причина (для журнала)" placeholderTextColor={currentTheme.textSecondary}
				style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.textSecondary }]} />

			<Text style={[styles.label, { color: currentTheme.textPrimary }]}>Подозрительный рекорд</Text>
			<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>Обнуляет лучший счёт режима и убирает игрока из таблицы текущего сезона.</Text>
			<View style={styles.row}>
				<StylizedButton text="Сбросить Классику" onClick={() => void run(async () => { await adminApi.resetRecord(player.id, "classic"); return "Рекорд Классики сброшен"; })} backgroundColor="#B91C1C" style={styles.smallButton} textStyle={styles.smallText} disabled={busy} />
				<StylizedButton text="Сбросить Хаос" onClick={() => void run(async () => { await adminApi.resetRecord(player.id, "chaos"); return "Рекорд Хаоса сброшен"; })} backgroundColor="#B91C1C" style={styles.smallButton} textStyle={styles.smallText} disabled={busy} />
			</View>
			{message && <Text style={[styles.muted, { color: currentTheme.textPrimary }]}>{message}</Text>}
		</View>
	);
}

function SeasonTab() {
	const { currentTheme } = useTheme();
	const [board, setBoard] = useState<"classic" | "chaos">("classic");
	const { data, error, loading } = useLoad<AdminSeasonRow[]>(() => adminApi.seasonTop(board), [board]);
	return (
		<View style={{ gap: 10 }}>
			<SegmentedControl items={[{ key: "classic", label: "Классика" }, { key: "chaos", label: "Хаос" }]} value={board} onChange={setBoard} small />
			<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>Топ-10 текущего сезона. Свежий аккаунт с огромным счётом — повод проверить игрока.</Text>
			{loading && <PixelLoader size="small" color={currentTheme.textPrimary} />}
			{error && <Text style={styles.error}>{error}</Text>}
			{data?.map((row, index) => (
				<View key={row.profile_id} style={[styles.card, styles.row, { borderColor: currentTheme.textSecondary }]}>
					<Text style={[styles.label, { color: currentTheme.accent, width: 28 }]}>{index + 1}</Text>
					<View style={{ flex: 1 }}>
						<Text style={[styles.label, { color: currentTheme.textPrimary }]}>{row.player_name}</Text>
						<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>аккаунт с {formatDate(row.account_created)} · счёт {formatDate(row.updated_at)}</Text>
					</View>
					<Text style={[styles.label, { color: currentTheme.textPrimary }]}>{row.score}</Text>
				</View>
			))}
		</View>
	);
}

function VersionTab() {
	const { currentTheme } = useTheme();
	const { data, loading } = useLoad<AdminOverview>(adminApi.overview, []);
	const [form, setForm] = useState<AndroidVersionConfig | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	useEffect(() => {
		if (data && !form) setForm(data.android_version ?? { latestVersion: "", latestBuildNumber: 0, downloadUrl: "", releaseNotes: "", isMandatory: false });
	}, [data, form]);
	if (loading || !form) return <PixelLoader size="small" color={currentTheme.textPrimary} />;

	const field = (label: string, value: string, onChange: (text: string) => void) => (
		<View style={{ gap: 4 }}>
			<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>{label}</Text>
			<TextInput value={value} onChangeText={onChange} autoCapitalize="none"
				style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.textSecondary }]} />
		</View>
	);
	const save = async () => {
		setMessage(null);
		try {
			await adminApi.setAndroidVersion({ ...form, latestBuildNumber: Math.trunc(Number(form.latestBuildNumber)) || 0 });
			setMessage("Сохранено: игроки на более старых сборках увидят предложение обновиться.");
		} catch (e) {
			setMessage(`Ошибка: ${(e as Error).message}`);
		}
	};
	return (
		<View style={{ gap: 10 }}>
			<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>Окно «Доступно обновление» в Android-приложении (по номеру сборки).</Text>
			{field("Версия", form.latestVersion, (text) => setForm({ ...form, latestVersion: text }))}
			{field("Номер сборки", String(form.latestBuildNumber), (text) => setForm({ ...form, latestBuildNumber: Number(text.replace(/\D/g, "")) || 0 }))}
			{field("Ссылка на APK", form.downloadUrl, (text) => setForm({ ...form, downloadUrl: text }))}
			{field("Что нового", form.releaseNotes ?? "", (text) => setForm({ ...form, releaseNotes: text }))}
			<View style={styles.row}>
				<Text style={[styles.label, { flex: 1, color: currentTheme.textPrimary }]}>Обязательное обновление</Text>
				<Switch value={Boolean(form.isMandatory)} onValueChange={(value) => setForm({ ...form, isMandatory: value })} />
			</View>
			<StylizedButton text="Сохранить" onClick={() => void save()} backgroundColor={currentTheme.buttonPrimary} />
			{message && <Text style={[styles.muted, { color: currentTheme.textPrimary }]}>{message}</Text>}
		</View>
	);
}

function LogTab() {
	const { currentTheme } = useTheme();
	const { data, error, loading } = useLoad<AdminLogRow[]>(adminApi.recentLog, []);
	return (
		<View style={{ gap: 8 }}>
			{loading && <PixelLoader size="small" color={currentTheme.textPrimary} />}
			{error && <Text style={styles.error}>{error}</Text>}
			{data?.length === 0 && <Text style={[styles.muted, { color: currentTheme.textSecondary }]}>Пока пусто.</Text>}
			{data?.map((row, index) => (
				<View key={`${row.created_at}-${index}`} style={[styles.card, { borderColor: currentTheme.textSecondary }]}>
					<Text style={[styles.label, { color: currentTheme.textPrimary }]}>{ACTION_LABELS[row.action] ?? row.action}{row.target ? ` · ${row.target}` : ""}</Text>
					<Text style={[styles.muted, { color: currentTheme.textSecondary }]}>{formatDate(row.created_at)} · {JSON.stringify(row.details)}</Text>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	topBar: { width: "92%", maxWidth: 440, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
	title: { fontFamily: "Silkscreen", fontSize: 18, textAlign: "center" },
	body: { width: "92%", maxWidth: 440, marginTop: 12, paddingBottom: 24 },
	statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	stat: { width: "48%", borderWidth: 1, borderRadius: 8, padding: 10 },
	statValue: { fontFamily: "Silkscreen", fontSize: 20 },
	statLabel: { fontSize: 12, marginTop: 2 },
	card: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 2 },
	row: { flexDirection: "row", alignItems: "center", gap: 8 },
	label: { fontFamily: "Silkscreen", fontSize: 13 },
	muted: { fontSize: 12, lineHeight: 17 },
	link: { fontFamily: "Silkscreen", fontSize: 13 },
	error: { color: "#F87171", fontSize: 12 },
	input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: "rgba(0,0,0,0.35)" },
	smallButton: { minWidth: 0, height: 36, paddingHorizontal: 12 },
	smallText: { fontSize: 11 },
});
