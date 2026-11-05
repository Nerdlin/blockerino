import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLanguage } from "@/constants/Localization";

const SEARCH_FROM = 8;

/**
 * A long friend list kept short: the first `collapsedCount` rows are always shown, the rest open under an
 * "All friends (N)" toggle, with a name search for big lists and a scroll box of its own, so the screen keeps its size.
 */
export default function ExpandableFriendList<T>({
	items,
	collapsedCount,
	keyOf,
	nameOf,
	renderRow,
	accent = "#9CA3AF",
}: {
	items: T[];
	collapsedCount: number;
	keyOf: (item: T) => string;
	nameOf: (item: T) => string;
	renderRow: (item: T) => React.ReactNode;
	accent?: string;
}) {
	const { t } = useLanguage();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const rest = items.slice(collapsedCount);
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const pool = collapsedCount > 0 ? rest : items;
		return needle ? items.filter((item) => nameOf(item).toLowerCase().includes(needle)) : pool;
	}, [collapsedCount, items, nameOf, query, rest]);

	return (
		<View style={styles.wrap}>
			{items.slice(0, collapsedCount).map((item) => <React.Fragment key={keyOf(item)}>{renderRow(item)}</React.Fragment>)}
			{rest.length > 0 && (
				<Pressable onPress={() => setOpen((value) => !value)} style={styles.toggle} accessibilityRole="button">
					<Text style={[styles.toggleText, { color: accent }]}>
						{open ? t("friends.collapse") : t("friends.showAll", { n: items.length })} {open ? "▲" : "▼"}
					</Text>
				</Pressable>
			)}
			{open && rest.length > 0 && (
				<View style={styles.box}>
					{items.length >= SEARCH_FROM && (
						<TextInput
							value={query}
							onChangeText={setQuery}
							placeholder={t("friends.search")}
							placeholderTextColor="#6B7280"
							style={styles.search}
							autoCorrect={false}
							autoCapitalize="none"
						/>
					)}
					<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
						{filtered.map((item) => <React.Fragment key={keyOf(item)}>{renderRow(item)}</React.Fragment>)}
						{filtered.length === 0 && <Text style={styles.empty}>{t("friends.noMatch")}</Text>}
					</ScrollView>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { width: "100%", gap: 6 },
	toggle: { alignSelf: "center", paddingVertical: 6, paddingHorizontal: 12 },
	toggleText: { fontFamily: "Silkscreen", fontSize: 10 },
	box: { width: "100%", gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 10, padding: 6, backgroundColor: "rgba(0,0,0,0.25)" },
	search: { fontFamily: "Silkscreen", fontSize: 11, color: "#F3F4F6", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
	scroll: { maxHeight: 260 },
	scrollContent: { gap: 6 },
	empty: { fontFamily: "Silkscreen", fontSize: 10, color: "#9CA3AF", textAlign: "center", paddingVertical: 8 },
});
