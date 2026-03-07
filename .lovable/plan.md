

## Проблема

Настройка голоса из админки (`AISettingsManager`) **не передаётся** студенту при озвучивании. Два мира полностью разъединены:

1. **Админка** сохраняет `extra_config.salute_voice` (например `kira`) в таблицу `ai_settings` в БД
2. **Студент** читает голос из `localStorage` (`ttsSettings.saluteVoice`, например `Natalya_24000`) — никогда не обращается к `ai_settings`

Edge-функция работает корректно (логи подтверждают маппинг `kira` → `Kir_24000`). Проблема на стороне клиента.

## Решение

При инициализации TTS-настроек в `useCourseLearning.ts` (или в `getStoredTTSSettings`) — загружать настройки TTS-контекста из `ai_settings` таблицы (контекст `tts`) и использовать как **дефолт**, который студент может переопределить в своём диалоге.

### Изменения

**1. `src/hooks/useCourseLearning.ts`**
- При маунте — запросить из `ai_settings` запись с `context = 'tts'`
- Если `provider === 'salutespeech'`, взять `extra_config.salute_voice` как дефолтный голос
- Если у студента в localStorage нет сохранённых настроек — использовать админские
- Если есть — использовать студентские (приоритет пользователя)

**2. `src/components/student/TTSSettingsDialog.tsx`**
- Передавать `adminDefaults` prop, чтобы при отсутствии localStorage показывать админский провайдер/голос
- Унифицировать ID голосов: в `getStoredTTSSettings` маппить lowercase admin-стиль (`kira`) в клиентский формат (`Kira_24000`)

**3. Маппинг голосов**
Добавить утилиту для конвертации между admin-форматом (`kira`, `boris`) и клиентским (`Kira_24000`, `Boris_24000`):
```ts
const ADMIN_TO_CLIENT_VOICE: Record<string, string> = {
  natalya: 'Natalya_24000',
  boris: 'Boris_24000',
  marfa: 'Marfa_24000',
  taras: 'Taras_24000',
  alexandr: 'Alexandra_24000',
  sergey: 'Sergey_24000',
  kira: 'Kira_24000',
};
```

### Файлы
- `src/hooks/useCourseLearning.ts` — загрузка admin TTS defaults из БД
- `src/components/student/TTSSettingsDialog.tsx` — поддержка adminDefaults, маппинг голосов

