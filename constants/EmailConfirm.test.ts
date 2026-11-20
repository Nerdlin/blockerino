import { emailConfirmCode, emailConfirmRedirect, passwordResetRedirect } from "./EmailConfirm";

describe("email confirmation links", () => {
	it("sends the letter's link to the page with the platform and language", () => {
		expect(emailConfirmRedirect("ru", "android")).toBe("https://blockerino.aionerdlin.me/email-confirmed.html?from=android&lang=ru");
		expect(emailConfirmRedirect("de", "web")).toBe("https://blockerino.aionerdlin.me/email-confirmed.html?from=web&lang=en");
	});

	it("marks a password-reset link so the page does not say the email was confirmed", () => {
		expect(passwordResetRedirect("ru", "android")).toBe("https://blockerino.aionerdlin.me/email-confirmed.html?from=android&lang=ru&type=recovery");
	});

	it("reads the code of the link that opens the app", () => {
		expect(emailConfirmCode("com.nerdlin.blockerino://email-confirmed?code=abc-123")).toEqual({ code: "abc-123", recovery: false });
		expect(emailConfirmCode("com.nerdlin.blockerino://email-confirmed")).toEqual({ code: null, recovery: false });
		expect(emailConfirmCode("com.nerdlin.blockerino://email-confirmed?code=abc&type=recovery")).toEqual({ code: "abc", recovery: true });
		expect(emailConfirmCode("com.nerdlin.blockerino://discord-auth?code=x")).toBeNull();
		expect(emailConfirmCode(null)).toBeNull();
	});
});
