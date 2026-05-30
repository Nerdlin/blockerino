# Настройка глобальной таблицы лидеров с Supabase

## Шаг 1: Создание проекта Supabase

1. Перейдите на [https://supabase.com](https://supabase.com)
2. Зарегистрируйтесь или войдите в аккаунт
3. Нажмите "New Project"
4. Заполните данные:
   - **Name**: blockerino-leaderboard (или любое другое имя)
   - **Database Password**: придумайте надежный пароль
   - **Region**: выберите ближайший к вашим пользователям регион
5. Нажмите "Create new project" и дождитесь завершения создания (1-2 минуты)

## Шаг 2: Создание таблицы для рекордов

1. В левом меню выберите **Table Editor**
2. Нажмите **New table**
3. Заполните данные:
   - **Name**: `high_scores`
   - Включите **Enable Row Level Security (RLS)**
4. Добавьте следующие колонки:

| Name | Type | Default Value | Primary | Extra |
|------|------|---------------|---------|-------|
| id | int8 | (auto) | ✓ | identity |
| player_name | text | - | - | - |
| score | int4 | - | - | - |
| game_mode | text | - | - | - |
| created_at | timestamptz | now() | - | - |

5. Нажмите **Save**

## Шаг 3: Настройка Row Level Security (RLS)

1. В Table Editor выберите таблицу `high_scores`
2. Нажмите на кнопку **RLS** (или перейдите в **Authentication > Policies**)
3. Создайте политику для чтения (SELECT):
   - Нажмите **New Policy**
   - Выберите **Create a policy from scratch**
   - **Policy name**: `Allow public read access`
   - **Policy command**: SELECT
   - **Target roles**: public
   - **USING expression**: `true`
   - Нажмите **Save**

4. Создайте политику для вставки (INSERT):
   - Нажмите **New Policy**
   - Выберите **Create a policy from scratch**
   - **Policy name**: `Allow public insert access`
   - **Policy command**: INSERT
   - **Target roles**: public
   - **WITH CHECK expression**: `true`
   - Нажмите **Save**

## Шаг 4: Получение API ключей

1. В левом меню выберите **Settings** (иконка шестеренки)
2. Выберите **API**
3. Скопируйте следующие значения:
   - **Project URL** (например: `https://xxxxx.supabase.co`)
   - **anon public** ключ (длинная строка, начинающаяся с `eyJ...`)

## Шаг 5: Настройка приложения

1. Откройте файл `constants/Supabase.tsx`
2. Замените значения:
   ```typescript
   const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // Вставьте Project URL
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Вставьте anon public ключ
   ```

## Шаг 6: Тестирование

1. Запустите приложение
2. Сыграйте игру и наберите очки
3. После окончания игры, если ваш счет попал в топ-100, появится кнопка для отправки в глобальную таблицу
4. Введите имя и нажмите "Submit Score"
5. Перейдите в меню "High Scores"
6. Переключитесь на "Global" - вы должны увидеть свой рекорд!

## Дополнительные настройки (опционально)

### Добавление индексов для производительности

В SQL Editor выполните:

```sql
-- Индекс для быстрой сортировки по очкам
CREATE INDEX idx_high_scores_score ON high_scores(game_mode, score DESC);

-- Индекс для быстрой фильтрации по дате
CREATE INDEX idx_high_scores_created_at ON high_scores(created_at DESC);
```

### Ограничение количества записей от одного игрока

Если хотите ограничить количество записей от одного игрока, добавьте в политику INSERT:

```sql
-- Разрешить вставку только если у игрока меньше 10 записей
WITH CHECK (
  (SELECT COUNT(*) FROM high_scores WHERE player_name = NEW.player_name AND game_mode = NEW.game_mode) < 10
)
```

### Автоматическая очистка старых записей

Создайте функцию для удаления записей старше 1 года:

```sql
CREATE OR REPLACE FUNCTION cleanup_old_scores()
RETURNS void AS $$
BEGIN
  DELETE FROM high_scores
  WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- Настройте pg_cron для автоматического запуска (требует расширения pg_cron)
SELECT cron.schedule('cleanup-old-scores', '0 0 * * 0', 'SELECT cleanup_old_scores()');
```

## Устранение неполадок

### Ошибка "Failed to submit score"

1. Проверьте, что вы правильно скопировали URL и ключ API
2. Убедитесь, что RLS политики настроены правильно
3. Проверьте консоль браузера на наличие ошибок

### Не отображаются глобальные рекорды

1. Убедитесь, что в таблице есть записи (проверьте в Table Editor)
2. Проверьте, что политика SELECT настроена правильно
3. Убедитесь, что интернет-соединение работает

### Проблемы с производительностью

1. Добавьте индексы (см. выше)
2. Ограничьте количество возвращаемых записей (уже установлено limit: 10)
3. Рассмотрите возможность кэширования на стороне клиента
