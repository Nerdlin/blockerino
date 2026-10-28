# Модерация фото аватарок

Игрок может загрузить фото (Профиль → аватар → «Загрузить фото»). Приложение режет его до квадрата 256x256 JPEG, файл лежит в бакете `avatars` Supabase в папке `<auth uid>/`. Бакет публичный на чтение, лимит файла 300 КБ, только jpeg/png/webp. Писать и удалять в папке может только её владелец.

## Жалобы
Игрок нажимает «Пожаловаться на фото» в профиле другого игрока, причина: `inappropriate`, `personal` или `other`. Жалоба попадает в таблицу `avatar_reports` (клиенты читать её не могут). Одна жалоба на пару «кто / на кого», не больше 20 в день с одного аккаунта.

Смотреть жалобы (SQL Editor в Supabase):

```sql
select r.id, r.created_at, r.reason, p.player_name, r.avatar_url
from avatar_reports r
join profiles p on p.auth_user_id = r.target_id
where r.resolved_at is null
order by r.created_at;
```

## Что делать с нарушением
Убрать фото у игрока (он снова увидит букву или эмодзи) и закрыть жалобы:

```sql
update profiles set avatar_url = null where auth_user_id = '<target_id>';
update avatar_reports set resolved_at = now() where target_id = '<target_id>';
```

Сам файл удаляется в Supabase → Storage → avatars → папка игрока. При удалении аккаунта приложение стирает файлы игрока, строки жалоб удаляются каскадом.

## Для Google Play
- «Безопасность данных»: добавить тип «Фотографии» (собирается, не передаётся третьим лицам, по желанию, цель: функции приложения).
- Проверять жалобы регулярно (хотя бы раз в неделю на старте).
