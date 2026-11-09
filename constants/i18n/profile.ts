import type { ScreenDictionary } from "./index";

export const profile: ScreenDictionary = {
	en: {
		"perk.champion": "Champion",
		"perk.top": "Top {rank}",
		"perk.board.classic": "Classic",
		"perk.board.chaos": "Chaos",
		"perk.board.elo": "Versus",
		"profile.avatarTitle": "Choose avatar",
		"profile.avatarUrlLabel": "Or custom image URL",
		"profile.chooseFile": "Upload a photo",
		"profile.removePhoto": "Remove photo",
		"profile.uploading": "Uploading...",
		"profile.uploadFailed": "Could not upload the photo. Try another one.",
		"profile.avatarNotice": "Your photo is shown to other players. Pick a picture you are happy to share. Others can report pictures that break the rules.",
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
		"record.title": "My record",
		"record.empty": "Play a game against a person or a bot and your record shows up here.",
		"record.people": "People",
		"record.bots": "Bots",
		"record.versus": "Block duels",
		"record.legend": "wins - losses - draws",
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
		"profile.rename.taken": "This name is taken",
		"profile.rename.invalid": "3-20 letters, digits, space, _ . -",
		"profile.rename.cooldown": "You can change the name again on {date}",
		"profile.rename.failed": "Could not change the name. Check the connection",
		"profile.rename.hint": "The name can be changed once every 30 days",
		"profile.emailPlaceholder": "Email",
		"profile.passwordPlaceholder": "Password",

		// Status / error messages
		"profile.fillAllFields": "Please fill all fields",
		"profile.enterPlayerName": "Please enter a player name",
		"profile.signUpSuccess": "Success! Check your email to verify (if required), or you are logged in.",
		"profile.authFailed": "Authentication failed",
		"profile.googleUnavailable": "Google OAuth is unavailable in this environment.",
		"profile.discordActivityAuthHint": "In Discord you are signed in automatically when the activity starts. Google sign-in works on the website and in the app.",
		"profile.googleNoUrl": "Google did not return a sign-in URL.",
		"profile.googleNoToken": "Google did not return an ID token. Check Android OAuth client SHA/package settings.",
		"profile.googleFailed": "Google Sign-In failed or was cancelled.",
		"profile.callbackFailed": "Authentication callback failed.",
		"profile.callbackExpired": "Google sign-in callback expired or was opened twice. Please try again.",
	},
	ru: {
		"perk.champion": "Чемпион",
		"perk.top": "Топ {rank}",
		"perk.board.classic": "Классика",
		"perk.board.chaos": "Хаос",
		"perk.board.elo": "Дуэли",
		"profile.avatarTitle": "Выберите аватар",
		"profile.avatarUrlLabel": "Или ссылка на изображение",
		"profile.chooseFile": "Загрузить фото",
		"profile.removePhoto": "Удалить фото",
		"profile.uploading": "Загрузка...",
		"profile.uploadFailed": "Не удалось загрузить фото. Попробуйте другое.",
		"profile.avatarNotice": "Фото видят другие игроки. Выберите картинку, которой не стесняетесь поделиться. На картинки, нарушающие правила, можно пожаловаться.",
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
		"record.title": "Мои результаты",
		"record.empty": "Сыграйте партию с человеком или ботом, и результаты появятся здесь.",
		"record.people": "Люди",
		"record.bots": "Боты",
		"record.versus": "Дуэли блоков",
		"record.legend": "победы - поражения - ничьи",
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
		"profile.rename.taken": "Это имя занято",
		"profile.rename.invalid": "3-20 букв, цифр, пробел, _ . -",
		"profile.rename.cooldown": "Снова сменить имя можно {date}",
		"profile.rename.failed": "Не удалось сменить имя. Проверьте связь",
		"profile.rename.hint": "Имя можно менять раз в 30 дней",
		"profile.emailPlaceholder": "Почта",
		"profile.passwordPlaceholder": "Пароль",

		// Status / error messages
		"profile.fillAllFields": "Заполните все поля",
		"profile.enterPlayerName": "Введите имя игрока",
		"profile.signUpSuccess": "Готово! Проверьте почту для подтверждения (если требуется), или вы уже вошли.",
		"profile.authFailed": "Ошибка авторизации",
		"profile.googleUnavailable": "Google OAuth недоступен в этой среде.",
		"profile.discordActivityAuthHint": "В Discord вход выполняется автоматически при запуске активности. Вход через Google доступен на сайте и в приложении.",
		"profile.googleNoUrl": "Google не вернул ссылку для входа.",
		"profile.googleNoToken": "Google не вернул ID-токен. Проверьте настройки SHA/пакета OAuth-клиента Android.",
		"profile.googleFailed": "Вход через Google не удался или был отменён.",
		"profile.callbackFailed": "Ошибка обратного вызова авторизации.",
		"profile.callbackExpired": "Ссылка входа Google истекла или открыта дважды. Попробуйте снова.",
	},
};
