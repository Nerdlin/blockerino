import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import StylizedButton from "./StylizedButton";
import { useTheme } from "@/constants/Theme";

// Small forms of the admin panel's player card: pick a game or time class, type the numbers to change (a field left empty
// keeps what is stored) and save. They only collect input; the card calls the server and says what happened.

export interface ChipItem {
	key: string;
	label: string;
}

export function Chips({ items, value, onChange }: { items: readonly ChipItem[]; value: string; onChange: (key: string) => void }) {
	const { currentTheme } = useTheme();
	return (
		<View style={styles.chips}>
			{items.map((item) => (
				<Pressable
					key={item.key}
					onPress={() => onChange(item.key)}
					style={[styles.chip, { borderColor: currentTheme.textSecondary }, item.key === value && { backgroundColor: currentTheme.buttonPrimary, borderColor: currentTheme.buttonPrimary }]}
				>
					<Text style={[styles.chipText, { color: currentTheme.textPrimary }]}>{item.label}</Text>
				</Pressable>
			))}
		</View>
	);
}

export interface StatField {
	key: string;
	label: string;
}

/** Wins, losses and the like for one chip (game or time class). `current` is what the server holds for it. */
export function StatEditor({ title, note, chips, fields, current, onSave, busy }: {
	title: string;
	note?: string;
	chips: readonly ChipItem[];
	fields: readonly StatField[];
	current: (chip: string) => object | undefined;
	onSave: (chip: string, values: Record<string, number | null>) => Promise<string>;
	busy: boolean;
}) {
	const { currentTheme } = useTheme();
	const [chip, setChip] = useState(chips[0].key);
	const [inputs, setInputs] = useState<Record<string, string>>({});
	const [message, setMessage] = useState<string | null>(null);
	const stored = current(chip);
	const parsed: Record<string, number | null> = {};
	let invalid = false;
	let any = false;
	for (const field of fields) {
		const text = (inputs[field.key] ?? "").trim();
		if (text === "") parsed[field.key] = null;
		else if (/^\d+$/.test(text)) {
			parsed[field.key] = Number(text);
			any = true;
		} else invalid = true;
	}
	const save = async () => {
		setMessage(null);
		try {
			setMessage(await onSave(chip, parsed));
			setInputs({});
		} catch (error) {
			setMessage(`Ошибка: ${(error as Error).message}`);
		}
	};
	return (
		<View style={styles.block}>
			<Text style={[styles.label, { color: currentTheme.textPrimary }]}>{title}</Text>
			{note && <Text style={[styles.muted, { color: currentTheme.textSecondary }]}>{note}</Text>}
			<Chips items={chips} value={chip} onChange={(key) => { setChip(key); setInputs({}); setMessage(null); }} />
			<View style={styles.fields}>
				{fields.map((field) => (
					<TextInput
						key={field.key}
						value={inputs[field.key] ?? ""}
						onChangeText={(text) => setInputs((existing) => ({ ...existing, [field.key]: text }))}
						keyboardType="number-pad"
						placeholder={`${field.label} (${stored ? (stored as Record<string, unknown>)[field.key] ?? 0 : "нет"})`}
						placeholderTextColor={currentTheme.textSecondary}
						style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.textSecondary }]}
					/>
				))}
			</View>
			<StylizedButton text="Задать" onClick={() => void save()} backgroundColor={currentTheme.buttonPrimary} style={styles.button} textStyle={styles.buttonText} disabled={busy || invalid || !any} />
			{message && <Text style={[styles.muted, { color: currentTheme.textPrimary }]}>{message}</Text>}
		</View>
	);
}

const styles = StyleSheet.create({
	block: { gap: 8 },
	label: { fontFamily: "Silkscreen", fontSize: 13 },
	muted: { fontSize: 12, lineHeight: 17 },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
	chipText: { fontSize: 12 },
	fields: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	input: { minWidth: 130, flexGrow: 1, flexBasis: "45%", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "rgba(0,0,0,0.35)" },
	button: { minWidth: 0, height: 36, paddingHorizontal: 12, alignSelf: "flex-start" },
	buttonText: { fontSize: 11 },
});
