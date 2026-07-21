import type { ScreenDictionary } from "./index";

export const profile: ScreenDictionary = {
	en: {
		"profile.title": "Profile",

		// Tabs
		"profile.tabStats": "Stats",
		"profile.tabHistory": "History",
		"profile.tabFriends": "Friends",

		// Stat labels
		"profile.coins": "Coins",
		"profile.elo": "Elo",
		"profile.classic": "Classic",
		"profile.chaos": "Chaos",
		"profile.matches": "Matches",

		// Buttons
		"profile.logOut": "Log Out",
		"profile.back": "Back",
		"profile.logIn": "Log In",
		"profile.register": "Register",
		"profile.googleSignIn": "Sign in with Google",
		"profile.discordSignIn": "Sign in with Discord",
		"profile.needAccount": "Need an account?",
		"profile.haveAccount": "Already have an account?",

		// Auth titles
		"profile.loginTitle": "Login to Sync",
		"profile.createAccountTitle": "Create Account",

		// Placeholders
		"profile.playerNamePlaceholder": "Player Name",
		"profile.emailPlaceholder": "Email",
		"profile.passwordPlaceholder": "Password",

		// Status / error messages
		"profile.fillAllFields": "Please fill all fields",
		"profile.enterPlayerName": "Please enter a player name",
		"profile.signUpSuccess": "Success! Check your email to verify (if required), or you are logged in.",
		"profile.authFailed": "Authentication failed",
		"profile.googleUnavailable": "Google OAuth is unavailable in this environment.",
		"profile.googleNoUrl": "Google did not return a sign-in URL.",
		"profile.googleNoToken": "Google did not return an ID token. Check Android OAuth client SHA/package settings.",
		"profile.googleFailed": "Google Sign-In failed or was cancelled.",
		"profile.callbackFailed": "Authentication callback failed.",
		"profile.callbackExpired": "Google sign-in callback expired or was opened twice. Please try again.",
	},
	ru: {
		"profile.title": "Профиль",

		// Tabs
		"profile.tabStats": "Статистика",
		"profile.tabHistory": "История",
		"profile.tabFriends": "Друзья",

		// Stat labels
		"profile.coins": "Монеты",
		"profile.elo": "Эло",
		"profile.classic": "Классика",
		"profile.chaos": "Хаос",
		"profile.matches": "Матчи",

		// Buttons
		"profile.logOut": "Выйти",
		"profile.back": "Назад",
		"profile.logIn": "Войти",
		"profile.register": "Регистрация",
		"profile.googleSignIn": "Войти через Google",
		"profile.discordSignIn": "Войти через Discord",
		"profile.needAccount": "Нужен аккаунт?",
		"profile.haveAccount": "Уже есть аккаунт?",

		// Auth titles
		"profile.loginTitle": "Вход для синхронизации",
		"profile.createAccountTitle": "Создать аккаунт",

		// Placeholders
		"profile.playerNamePlaceholder": "Имя игрока",
		"profile.emailPlaceholder": "Почта",
		"profile.passwordPlaceholder": "Пароль",

		// Status / error messages
		"profile.fillAllFields": "Заполните все поля",
		"profile.enterPlayerName": "Введите имя игрока",
		"profile.signUpSuccess": "Готово! Проверьте почту для подтверждения (если требуется), или вы уже вошли.",
		"profile.authFailed": "Ошибка авторизации",
		"profile.googleUnavailable": "Google OAuth недоступен в этой среде.",
		"profile.googleNoUrl": "Google не вернул ссылку для входа.",
		"profile.googleNoToken": "Google не вернул ID-токен. Проверьте настройки SHA/пакета OAuth-клиента Android.",
		"profile.googleFailed": "Вход через Google не удался или был отменён.",
		"profile.callbackFailed": "Ошибка обратного вызова авторизации.",
		"profile.callbackExpired": "Ссылка входа Google истекла или открыта дважды. Попробуйте снова.",
	},
};
