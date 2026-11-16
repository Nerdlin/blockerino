import { emailConfirmCode, emailConfirmRedirect } from "./EmailConfirm";

describe("email confirmation links", () => {
	it("sends the letter's link to the page with the platform and language", () => {
		expect(emailConfirmRedirect("ru", "android")).toBe("https://blockerino.aionerdlin.me/email-confirmed.html?from=android&lang=ru");
		expect(emailConfirmRedirect("de", "web")).toBe("https://blockerino.aionerdlin.me/email-confirmed.html?from=web&lang=en");
	});

	it("reads the code of the link that opens the app", () => {
		expect(emailConfirmCode("com.nerdlin.blockerino://email-confirmed?code=abc-123")).toEqual({ code: "abc-123" });
		expect(emailConfirmCode("com.nerdlin.blockerino://email-confirmed")).toEqual({ code: null });
		expect(emailConfirmCode("com.nerdlin.blockerino://discord-auth?code=x")).toBeNull();
		expect(emailConfirmCode(null)).toBeNull();
	});
});
