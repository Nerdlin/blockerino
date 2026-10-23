jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { opaqueColor } from "./Theme";

describe("opaqueColor", () => {
	it("drops the alpha of an rgba colour", () => {
		expect(opaqueColor("rgba(5, 5, 5, 0.95)")).toBe("rgb(5, 5, 5)");
		expect(opaqueColor("rgba(30,62,46,0.5)")).toBe("rgb(30, 62, 46)");
	});

	it("leaves other colours alone", () => {
		expect(opaqueColor("#112233")).toBe("#112233");
		expect(opaqueColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
	});
});
