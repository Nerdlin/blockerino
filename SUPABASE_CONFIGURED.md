# ✅ Supabase настроен и готов к работе!

## 🎉 Что было сделано через MCP

### 1. 📊 База данных

#### Таблица `high_scores` (глобальная таблица лидеров)
- ✅ Создана с колонками:
  - `id` (bigint, primary key)
  - `player_name` (text, default: 'Anonymous')
  - `score` (integer, default: 0)
  - `game_mode` (text, default: 'Classic')
  - `created_at` (timestamptz, default: now())
- ✅ Включен Row Level Security (RLS)
- ✅ Созданы индексы для быстрых запросов:
  - `idx_high_scores_game_mode_score` - для сортировки по очкам
  - `idx_high_scores_created_at` - для сортировки по дате

#### Таблица `app_config` (конфигурация авто-обновлений)
- ✅ Создана с колонками:
  - `id` (serial, primary key)
  - `key` (text, unique)
  - `value` (jsonb)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- ✅ Включен Row Level Security (RLS)
- ✅ Добавлена начальная конфигурация для Android версии 1.0.0

### 2. 🔐 Политики безопасности (RLS Policies)

#### Для `high_scores`:
- ✅ **Allow public read access** - любой может читать таблицу лидеров
- ✅ **Allow public insert access** - любой может добавлять свои рекорды

#### Для `app_config`:
- ✅ **Allow public read access** - любой может читать конфигурацию обновлений

### 3. 🔑 Конфигурация приложения

Файл [constants/Supabase.tsx](constants/Supabase.tsx) обновлён с реальными ключами:
- **URL**: `https://ptcglecvavdvpxadqfqd.supabase.co`
- **Anon Key**: настроен ✅

## 🚀 Что теперь работает

### Глобальная таблица лидеров
1. После окончания игры, если счёт попадает в топ-100, игрок может отправить свой рекорд
2. В меню High Scores можно переключаться между:
   - **Global** - все игроки со всего мира
   - **Local** - только ваши локальные рекорды

### Система авто-обновлений Android
1. При запуске приложения проверяется версия в Supabase
2. Если доступна новая версия, показывается диалог обновления
3. Текущая конфигурация в базе:
   ```json
   {
     "latestVersion": "1.0.0",
     "latestBuildNumber": 1,
     "downloadUrl": "https://github.com/Nerdlin/blockerino/releases/download/v1.0.0/blockerino-v1.0.0.apk",
     "releaseNotes": "Initial release with global leaderboard",
     "isMandatory": false
   }
   ```

## 📝 Следующие шаги

### 1. Протестируйте глобальную таблицу лидеров

```bash
npm start
```

1. Запустите приложение
2. Сыграйте игру и наберите очки
3. После Game Over введите имя и отправьте рекорд
4. Откройте меню High Scores → переключитесь на Global
5. Вы должны увидеть свой рекорд!

### 2. Соберите Android APK

Следуйте инструкциям в [ANDROID_BUILD.md](ANDROID_BUILD.md):

```bash
# Установите EAS CLI
npm install -g eas-cli

# Войдите в Expo
eas login

# Соберите APK
eas build --platform android --profile production
```

### 3. Обновите конфигурацию для новых версий

Когда соберёте новую версию APK, обновите конфигурацию в Supabase:

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard/project/ptcglecvavdvpxadqfqd)
2. Перейдите в Table Editor → `app_config`
3. Отредактируйте запись с `key = 'android_version'`
4. Обновите поля:
   - `latestVersion` - новая версия (например, "1.0.1")
   - `latestBuildNumber` - новый номер сборки (например, 2)
   - `downloadUrl` - ссылка на новый APK
   - `releaseNotes` - описание изменений
   - `isMandatory` - обязательное обновление (true/false)

## 🔗 Полезные ссылки

- **Supabase Dashboard**: https://supabase.com/dashboard/project/ptcglecvavdvpxadqfqd
- **Table Editor**: https://supabase.com/dashboard/project/ptcglecvavdvpxadqfqd/editor
- **API Settings**: https://supabase.com/dashboard/project/ptcglecvavdvpxadqfqd/settings/api

## 📊 Структура базы данных

```
public.high_scores
├── id (bigint, PK)
├── player_name (text)
├── score (integer)
├── game_mode (text)
└── created_at (timestamptz)

public.app_config
├── id (serial, PK)
├── key (text, unique)
├── value (jsonb)
├── created_at (timestamptz)
└── updated_at (timestamptz)
```

## ✨ Готово!

Ваш проект Blockerino теперь полностью настроен с:
- ✅ Глобальной таблицей лидеров
- ✅ Системой авто-обновлений для Android
- ✅ Автодеплоем веб-версии на GitHub Pages
- ✅ Безопасными политиками доступа (RLS)
- ✅ Оптимизированными индексами для быстрых запросов

Можете начинать тестирование! 🎮

---

**Дата настройки**: 2026-05-30  
**Проект**: blockerino-leaderboard  
**Region**: ap-southeast-2 (Sydney)  
**Status**: ACTIVE_HEALTHY ✅
