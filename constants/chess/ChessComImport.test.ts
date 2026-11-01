jest.mock("@/constants/Supabase", () => ({ supabase: {} }));

import { parseImportResult, parseImportStatus } from "./ChessComImport";

describe("chess.com rating import", () => {
	it("reads the code to put into the chess.com profile", () => {
		expect(parseImportStatus({ status: "pending", code: "BLK-44FJUK" })).toEqual({ status: "pending", code: "BLK-44FJUK" });
	});

	it("reads a finished import", () => {
		expect(parseImportStatus({ status: "imported", username: "Nerdlin", ratings: { rapid: 475 } }))
			.toEqual({ status: "imported", username: "Nerdlin", ratings: { rapid: 475 } });
	});

	it("treats anything unexpected as a failure", () => {
		expect(parseImportStatus(null)).toEqual({ status: "failed" });
		expect(parseImportStatus({ status: "pending" })).toEqual({ status: "failed" });
		expect(parseImportResult({ status: "weird" })).toEqual({ status: "failed" });
	});

	it("passes the server's reasons through", () => {
		expect(parseImportResult({ status: "code_missing", code: "BLK-1" })).toEqual({ status: "code_missing" });
		expect(parseImportResult({ status: "username_taken" })).toEqual({ status: "username_taken" });
	});
});
