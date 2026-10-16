# Как выпускать релиз Blockerino

Порядок важен: **сначала релиз на GitHub, потом пуш в `main` и обновление `app_config`.**
Пуш в `main` автоматически применяет миграции из `supabase/migrations/` к боевой базе (через интеграцию
Supabase ↔ GitHub), а запись `android_version` в `app_config` рассылает игрокам уведомление об обновлении.
Если сделать это раньше, чем APK лежит в GitHub Releases, игроки получат ссылку на несуществующий файл.

## Шаги

### 1. Подготовка (делает Claude, без пуша)
- Поднять версию: `app.json` (`version`, `versionCode`, `runtimeVersion`), `package.json`, `android/app/build.gradle` (`versionCode`, `versionName`), запасное значение в `components/OptionsMenu.tsx`.
- Написать `docs/release-X.Y.Z.md` (что нового, проверки, развёртывание).
- Проверки: `npx tsc --noEmit`, `npx jest`.
- Закоммитить локально. **Не пушить.**

### 2. Сборка
- APK: `scripts/build-android-release.ps1 -OutputPath <путь>.apk`
- AAB: `android\gradlew.bat -p android bundleRelease "-Pexpo.useLegacyPackaging=true"`
- Посчитать размеры и SHA-256, вписать их в `docs/release-X.Y.Z.md`, закоммитить.
- Закоммитить всё и запушить **только рабочую ветку и тег**: `git tag vX.Y.Z` на этом последнем коммите, затем `git push origin <ветка> refs/tags/vX.Y.Z`. `main` не трогать. Тег на нужном коммите нужен, чтобы архив «Source code» релиза содержал код релиза (раньше тег указывал на старый `main`).
- Сказать пользователю пути к файлам.

### 3. Публикация (делает пользователь)
- GitHub → Releases → New release, **выбрать уже существующий тег `vX.Y.Z`** (не создавать новый и не оставлять target `main`), загрузить APK и AAB, нажать **Publish release**.
- Написать Claude: «релиз сделал».

### 4. После слов «релиз сделал» (делает Claude)
1. Проверить, что тег указывает на последний коммит релиза: `git ls-remote origin refs/tags/vX.Y.Z` совпадает с `git rev-parse HEAD`. Если нет, перенести: `git tag -f vX.Y.Z <коммит>` и `git push --force origin refs/tags/vX.Y.Z`.
2. Проверить релиз через публичный API: `https://api.github.com/repos/Nerdlin/blockerino/releases/tags/vX.Y.Z` (не draft, оба файла, размеры и `digest` совпадают с `docs/release-X.Y.Z.md`), и что ссылки на скачивание отдают 200.
3. Запушить: `git push origin HEAD:refs/heads/main` и ветку, в которой идёт работа.
4. Применить миграции и функции, если они есть в релизе (`supabase functions deploy <имя> --project-ref ptcglecvavdvpxadqfqd`). Версия миграции в базе должна совпадать с именем файла (`supabase/MIGRATIONS.md`).
5. Обновить уведомление об обновлении (только после проверки из п. 1 и подтверждения пользователя):

```sql
UPDATE public.app_config
SET value = jsonb_build_object(
  'latestVersion', 'X.Y.Z',
  'latestBuildNumber', N,
  'downloadUrl', 'https://github.com/Nerdlin/blockerino/releases/download/vX.Y.Z/blockerino-X.Y.Z.apk',
  'releaseNotes', 'Короткое описание на английском',
  'isMandatory', false
)
WHERE key = 'android_version';
```

6. Проверить результат: `SELECT value FROM app_config WHERE key = 'android_version';`

## Как работает уведомление в приложении
`constants/UpdateService.tsx` читает `app_config.android_version` при запуске, при возвращении в игру (не чаще раза в 15 минут)
и каждые 30 минут, пока игра открыта. Если версия или build выше установленных, показывается окно «Доступно обновление»
(одно и то же окно не повторяется в сессии). Ручная проверка: Настройки → Обновления.
Для обязательного обновления поставить `'isMandatory', true`.
