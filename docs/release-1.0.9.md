# Blockerino 1.0.9

**Исправления онлайн-игр (Sea Battle, Durak, шахматы), новые правила и вид Sea Battle, единый ник аккаунта в Versus и More Games.**

## 📥 Скачать

Артефакты собраны (версия `1.0.9`, сборка `10`) и должны быть выложены в GitHub Releases как `v1.0.9`:

- **[Скачать Blockerino 1.0.9 для Android (APK)](https://github.com/Nerdlin/blockerino/releases/download/v1.0.9/blockerino-1.0.9.apk)** · APK · 50,0 МиБ · сборка 10
- **[Скачать Blockerino 1.0.9 Android App Bundle (AAB)](https://github.com/Nerdlin/blockerino/releases/download/v1.0.9/blockerino-1.0.9.aab)** · AAB · 68,7 МиБ · сборка 10 (для Google Play Console)

## 🎮 Что нового и исправлено

### Sea Battle Online
- **Исправлено зависание входа:** после того как соперник заходил в комнату, оба игрока оставались на экране «Connecting…» / «Room created». Экран ожидания теперь закрывается, когда соперник в комнате, а кнопка «Ready» доступна сразу.
- **Новое правило хода:** попал, значит стреляешь снова; промахнулся, значит ход переходит сопернику.
- **Потопленные корабли:** раненый корабль отмечается огнём, а потопленный целиком получает крестики на каждой клетке и на кольце в одну клетку вокруг (у стреляющего и у защищающегося). Обстрелять отмеченные клетки нельзя.

### Durak Online
- Масти карт рисуются пиксельными иконками, а не системными глифами, поэтому на Android карты выглядят так же, как в вебе.

### Шахматы
- После окончания онлайн-партии кнопка «Play Again» убрана.

### Versus и More Games
- **Quick Match убран** с экрана Versus, кнопка «Create Room» занимает всю ширину и больше не выходит за границы на телефоне.
- **Ник привязан к аккаунту:** вошедший игрок больше не видит поле ника ни в Versus, ни в More Games, имя берётся из профиля и меняется только там. Гость видит поле ника и кнопки «Create account» / «I have an account» (в More Games они появились впервые).

## 🛠 Развёртывание (после публикации APK)

1. Миграций в этом релизе нет.
2. **После** загрузки APK в GitHub Releases обновить запись `android_version` в `app_config`:

```sql
UPDATE public.app_config
SET value = jsonb_build_object(
  'latestVersion', '1.0.9',
  'latestBuildNumber', 10,
  'downloadUrl', 'https://github.com/Nerdlin/blockerino/releases/download/v1.0.9/blockerino-1.0.9.apk',
  'releaseNotes', 'Fixes for Sea Battle and Durak online, new Sea Battle rules, account nickname in Versus and More Games.',
  'isMandatory', false
)
WHERE key = 'android_version';
```

## ⚠️ Известные ограничения

- Новое правило хода и крестики в Sea Battle работают между клиентами 1.0.9; старые клиенты не покажут крестики, а правило хода у них прежнее.
- Сборка подписана **отладочным ключом** (как 1.0.6 и 1.0.8), ключи `BLOCKERINO_UPLOAD_*` не заданы.
- Вход по аккаунту и сам экран профиля в этом релизе на устройстве вручную не проверялись.

## ✅ Проверки

- **TypeScript:** `npx tsc --noEmit` — 0 ошибок.
- **Тесты:** `npx jest` — 25 наборов, 134 теста успешно.
- **Веб (два клиента):** вход в Sea Battle и Durak, Ready-экран Sea Battle.
- **Устройство (Android, 1.0.8):** вход в Durak хостом и гостем между телефоном и вебом.
- **Не проверено вручную:** новые карты Durak и Versus на телефоне, функции с входом в аккаунт.

<details>
<summary>Технические сведения</summary>

- **Версия:** 1.0.9 · **Номер сборки:** 10 (`versionCode 10`).
- **runtimeVersion:** 1.0.9.
- **Архитектуры:** universal (arm64-v8a, armeabi-v7a, x86, x86_64).

- **Размер APK:** 52 461 152 байт.
- **Размер AAB:** 72 005 140 байт.

SHA-256 контрольные суммы:

```text
APK: 7D59243CDEF2712EF192C18E52CDA2231BBAA45A66D79938DD5196D07C08B128
AAB: ED9F7526BEC45F9B6CCE49E151506BA3CA37AB35A97E0FEC218193051CA5CF1C
```

</details>
