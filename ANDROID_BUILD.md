# 📱 Инструкция по сборке Android приложения Blockerino

## 🎯 Обзор

Это приложение создано на React Native с использованием Expo. Для сборки Android APK используется EAS Build (Expo Application Services).

## 📋 Предварительные требования

1. **Node.js** (версия 18 или выше)
2. **npm** или **yarn**
3. **Expo CLI**: `npm install -g expo-cli`
4. **EAS CLI**: `npm install -g eas-cli`
5. **Аккаунт Expo**: Зарегистрируйтесь на [expo.dev](https://expo.dev)

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка Supabase (для глобальной таблицы лидеров)

Следуйте инструкциям в [SUPABASE_SETUP.md](SUPABASE_SETUP.md) для настройки бэкенда.

После создания проекта Supabase:

1. Откройте [constants/Supabase.tsx](constants/Supabase.tsx)
2. Замените `YOUR_SUPABASE_URL` и `YOUR_SUPABASE_ANON_KEY` на ваши реальные значения

### 3. Настройка системы авто-обновлений

Создайте таблицу `app_config` в Supabase:

```sql
CREATE TABLE app_config (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Разрешить публичное чтение
CREATE POLICY "Allow public read access" ON app_config
    FOR SELECT USING (true);

-- Вставить начальную конфигурацию версии
INSERT INTO app_config (key, value) VALUES (
    'android_version',
    '{
        "latestVersion": "1.0.0",
        "latestBuildNumber": 1,
        "downloadUrl": "https://your-domain.com/blockerino-v1.0.0.apk",
        "releaseNotes": "Initial release",
        "isMandatory": false
    }'::jsonb
);
```

## 🔨 Сборка APK

### Вариант 1: Локальная сборка (быстрее, но требует Android SDK)

```bash
# Установите Android Studio и настройте Android SDK
# Затем выполните:
npx expo run:android --variant release
```

APK будет находиться в `android/app/build/outputs/apk/release/`

### Вариант 2: EAS Build (рекомендуется, сборка в облаке)

#### Шаг 1: Войдите в Expo

```bash
eas login
```

#### Шаг 2: Настройте проект

```bash
eas build:configure
```

#### Шаг 3: Соберите APK

```bash
# Preview сборка (для тестирования)
eas build --platform android --profile preview

# Production сборка
eas build --platform android --profile production
```

#### Шаг 4: Скачайте APK

После завершения сборки (5-15 минут):
1. Перейдите по ссылке, которую выдаст команда
2. Скачайте APK файл
3. Установите на Android устройство

## 📦 Обновление версии

Перед каждой новой сборкой обновите версию в [app.json](app.json):

```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

**Важно:**
- `version` - семантическая версия (1.0.0, 1.0.1, 1.1.0 и т.д.)
- `versionCode` - целое число, должно увеличиваться с каждой сборкой

## 🔄 Настройка авто-обновлений

### 1. Загрузите APK на сервер

После сборки загрузите APK на ваш сервер или используйте:
- GitHub Releases
- Google Drive (с публичной ссылкой)
- Любой файловый хостинг

### 2. Обновите конфигурацию в Supabase

В Table Editor откройте таблицу `app_config` и обновите запись `android_version`:

```json
{
  "latestVersion": "1.0.1",
  "latestBuildNumber": 2,
  "downloadUrl": "https://your-domain.com/blockerino-v1.0.1.apk",
  "releaseNotes": "- Fixed bugs\n- Added new features\n- Improved performance",
  "isMandatory": false
}
```

**Параметры:**
- `latestVersion` - последняя версия приложения
- `latestBuildNumber` - номер сборки (должен совпадать с versionCode)
- `downloadUrl` - прямая ссылка на APK файл
- `releaseNotes` - описание изменений (опционально)
- `isMandatory` - обязательное обновление (true/false)

### 3. Как это работает

1. При запуске приложения проверяется версия в Supabase
2. Если доступна новая версия, пользователь видит диалог обновления
3. При нажатии "Update Now" открывается браузер со ссылкой на APK
4. Пользователь скачивает и устанавливает обновление

## 🎨 Кастомизация иконки и splash screen

### Иконка приложения

Замените файлы:
- `assets/images/icon.png` (1024x1024 px)
- `assets/images/adaptive-icon.png` (1024x1024 px)

### Splash Screen

Замените файл:
- `assets/images/splash-icon.png` (рекомендуется 1242x2436 px)

## 🐛 Устранение неполадок

### Ошибка "AAPT: error: resource android:attr/lStar not found"

Обновите Android SDK Build Tools:
```bash
# В Android Studio: Tools > SDK Manager > SDK Tools
# Установите последнюю версию Android SDK Build-Tools
```

### Ошибка "Execution failed for task ':app:processReleaseResources'"

Очистите кэш:
```bash
cd android
./gradlew clean
cd ..
npx expo run:android --variant release
```

### EAS Build зависает

Проверьте статус на [status.expo.dev](https://status.expo.dev)

## 📊 Структура проекта

```
blockerino/
├── app/                    # Экраны приложения (Expo Router)
├── components/             # React компоненты
├── constants/              # Константы и сервисы
│   ├── Supabase.tsx       # Конфигурация Supabase
│   ├── UpdateService.tsx  # Сервис авто-обновлений
│   └── Storage.tsx        # Локальное хранилище
├── assets/                # Изображения, шрифты, звуки
├── app.json               # Конфигурация Expo
├── eas.json               # Конфигурация EAS Build
└── package.json           # Зависимости

```

## 🔗 Полезные ссылки

- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [React Native Documentation](https://reactnative.dev/)
- [Supabase Documentation](https://supabase.com/docs)

## 📝 Чеклист перед релизом

- [ ] Обновлена версия в app.json
- [ ] Обновлен versionCode в app.json
- [ ] Настроен Supabase (URL и ключи)
- [ ] Создана таблица app_config в Supabase
- [ ] Протестировано на реальном устройстве
- [ ] Проверена работа глобальной таблицы лидеров
- [ ] Проверена система авто-обновлений
- [ ] APK загружен на сервер
- [ ] Обновлена конфигурация в Supabase

## 🎉 Готово!

После выполнения всех шагов у вас будет:
- ✅ Рабочее Android приложение
- ✅ Глобальная таблица лидеров
- ✅ Система авто-обновлений
- ✅ Возможность обновлять приложение без Google Play

---

**Автор:** Nerdlin  
**Версия документа:** 1.0.0  
**Дата:** 2026-05-30
