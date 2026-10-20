# Push-уведомления: что настроить

Серверная часть и Edge-функция уже в репозитории. Для Android нужны три вещи: Firebase (ключи для FCM),
Expo (загрузить ключ) и Supabase (секрет и расписание рассылки).

**Важно про порядок:** шаги 1–3 (Firebase и Expo) можно делать уже сейчас. Шаги 4–6 (Supabase) делаются
в день релиза 2.0, после того как миграции применены к боевой базе: таблицы уведомлений появятся только тогда.

## 1. Firebase: приложение Android и файл `google-services.json`

1. Firebase Console → проект **Blockerino** → **Project Overview** → **Add app** (значок Android).
2. **Android package name:** `com.nerdlin.blockerino` (ровно так, как в `app.json`). Название: Blockerino.
3. SHA-1 можно пропустить (понадобится для входа через Google; его берут из `eas credentials` и из Play Console
   → Setup → App signing, когда выпустите в Google Play).
4. **Register app** → **Download google-services.json**.
5. Положите файл в корень проекта: `C:\MI\my project\blockerino\google-services.json`.
6. Дальше в мастере жмите **Next** → **Continue to console** (SDK подключать не нужно, Expo делает это сам).

Файл содержит идентификаторы и клиентский ключ проекта, не пароли, но репозиторий публичный, поэтому
`google-services.json` внесён в `.gitignore` и не коммитится. Локальные сборки берут его с диска, облачным
сборкам EAS его нужно отдать как секрет (см. шаг 3).

## 2. Firebase: ключ для отправки (FCM V1)

1. Firebase Console → ⚙ **Project settings** → вкладка **Service accounts**.
2. Кнопка **Generate new private key** → скачается JSON.
3. **Этот файл секретный.** Не кладите его в репозиторий (в `.gitignore` уже есть шаблон `*firebase-adminsdk*.json`).
   Храните вне проекта, например в `C:\Users\nerdl\secrets\`.

## 3. Expo: загрузить ключ и файл

В терминале в папке проекта:

```bash
npx eas-cli login
```

```bash
npx eas-cli credentials
```

В меню выберите: **Android** → профиль сборки **production** → **Google Service Account** →
**Manage your Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new service
account key** → путь к JSON из шага 2.

Если не хотите коммитить `google-services.json`, отдайте его EAS как секретный файл (одна команда):

```bash
npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment production --environment preview
```

(`app.config.js` сам подхватит и файл в корне, и переменную `GOOGLE_SERVICES_JSON`.) Если команда выдаст
ошибку формата, пришлите её текст, версии `eas-cli` отличаются.

Потом нужна **новая сборка** (APK/AAB): модуль уведомлений нативный, «по воздуху» он не обновляется.

## 4. Supabase: секрет рассылки (в день релиза)

Секрет защищает функцию `send-push`: вызвать её может только расписание Supabase.

1. Придумайте длинный случайный секрет (одна команда, значение скопируйте):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

2. Сохраните его как секрет функции:

```bash
npx supabase secrets set CRON_SECRET=ВАШ_СЕКРЕТ --project-ref ptcglecvavdvpxadqfqd
```

## 5. Supabase: выложить функцию (после применения миграций)

```bash
npx supabase functions deploy send-push --project-ref ptcglecvavdvpxadqfqd --no-verify-jwt
```

## 6. Supabase: расписание «каждую минуту»

Supabase Dashboard → **Database → Extensions**: включите **pg_net** (pg_cron уже подключён миграциями).
Потом **SQL Editor** и выполните (подставьте свой секрет один раз, дальше он хранится в Vault):

```sql
select vault.create_secret('ВАШ_СЕКРЕТ', 'send_push_secret');

select cron.schedule(
  'send-push',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ptcglecvavdvpxadqfqd.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_push_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Проверка: `select * from cron.job_run_details order by start_time desc limit 5;` и логи функции
(Dashboard → Edge Functions → send-push → Logs).

## Как проверить, что всё работает

1. Установите новую сборку на телефон, войдите в аккаунт, разрешите уведомления.
2. В SQL Editor создайте тестовое уведомление себе (подставьте свой `player_name`):

```sql
insert into user_notifications (profile_id, kind, payload)
select id, 'streak_risk', '{"streak": 5, "reward": 100}'::jsonb from profiles where player_name = 'ВАШ_НИК';
```

3. В течение минуты на телефон придёт «Your 5-day streak is at risk».

## Если пуши не приходят

- В `push_tokens` нет вашей строки: приложение не получило токен (не разрешены уведомления, нет
  `google-services.json` в сборке, Google Play Services недоступны).
- Строка `user_notifications.pushed_at` пустая: расписание не запущено или секрет не совпадает (функция отвечает 403).
- Токен удалился сам: Expo ответил `DeviceNotRegistered` (приложение удалено или данные очищены).
