import React from "react";
import { StyleSheet, Text } from "react-native";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { ageLabel } from "@/constants/LastKnown";

/** One line under an offline notice: the data below is the last answer saved on this device, and from when. */
export default function SavedDataNote({ savedAt }: { savedAt: number }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const label = ageLabel(savedAt, Date.now());
	return <Text style={[styles.note, { color: currentTheme.textSecondary }]}>{t(label.key, { time: label.time ?? "", date: label.date ?? "" })}</Text>;
}

const styles = StyleSheet.create({
	note: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center", marginBottom: 8 },
});
