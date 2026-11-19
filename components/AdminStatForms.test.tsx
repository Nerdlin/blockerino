import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("@/constants/Theme", () => ({ useTheme: () => ({ currentTheme: { textPrimary: "#fff", textSecondary: "#aaa", buttonPrimary: "#08f" } }) }));
jest.mock("./StylizedButton", () => {
	const { Pressable, Text } = require("react-native");
	return { __esModule: true, default: ({ text, onClick, disabled }: { text: string; onClick: () => void; disabled?: boolean }) => (
		<Pressable testID={`btn-${text}`} onPress={disabled ? undefined : onClick} accessibilityState={{ disabled: !!disabled }}><Text>{text}</Text></Pressable>
	) };
});

import { StatEditor } from "./AdminStatForms";

const chips = [{ key: "blitz", label: "Блиц" }, { key: "rapid", label: "Рапид" }];
const fields = [{ key: "rating", label: "Рейтинг" }, { key: "wins", label: "Победы" }];

function mount(onSave: jest.Mock) {
	let renderer!: TestRenderer.ReactTestRenderer;
	act(() => {
		renderer = TestRenderer.create(<StatEditor title="Шахматы" chips={chips} fields={fields} current={(chip) => (chip === "blitz" ? { rating: 1500, wins: 7 } : undefined)} onSave={onSave} busy={false} />);
	});
	return renderer;
}
const inputs = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((node) => node.props.placeholder !== undefined && typeof node.type === "string");
const save = (r: TestRenderer.ReactTestRenderer) => r.root.findByProps({ testID: "btn-Задать" });

describe("StatEditor", () => {
	it("shows what is stored for the chosen chip in the placeholders", () => {
		const r = mount(jest.fn());
		expect(inputs(r).map((node) => node.props.placeholder)).toEqual(["Рейтинг (1500)", "Победы (7)"]);
		const chip = r.root.findAll((node) => typeof node.props.onPress === "function").find((node) => node.findAll((inner) => inner.props.children === "Рапид").length > 0)!;
		act(() => chip.props.onPress());
		expect(inputs(r).map((node) => node.props.placeholder)).toEqual(["Рейтинг (нет)", "Победы (нет)"]);
	});

	it("keeps Save off until a number is typed and sends empty fields as null", async () => {
		const onSave = jest.fn().mockResolvedValue("ok");
		const r = mount(onSave);
		expect(save(r).props.accessibilityState.disabled).toBe(true);
		act(() => inputs(r)[1].props.onChangeText("12"));
		expect(save(r).props.accessibilityState.disabled).toBe(false);
		await act(async () => {
			save(r).props.onPress();
		});
		expect(onSave).toHaveBeenCalledWith("blitz", { rating: null, wins: 12 });
	});

	it("refuses text that is not a whole number", () => {
		const r = mount(jest.fn());
		act(() => inputs(r)[0].props.onChangeText("12a"));
		expect(save(r).props.accessibilityState.disabled).toBe(true);
	});
});
