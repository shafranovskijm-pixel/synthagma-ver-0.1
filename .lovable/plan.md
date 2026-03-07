

## Проблема

Настройка голоса SaluteSpeech из админки (`AISettingsManager`) **не применяется** при озвучивании уроков студентами. Причины:

1. `TTSSettings` содержит только `voiceId` (ElevenLabs) и `useElevenLabs: boolean` — нет поддержки SaluteSpeech как провайдера
2. `speakText()` в `useCourseLearning.ts` знает только два пути: ElevenLabs или браузерный синтез
3. `TTSSettingsDialog` не предлагает SaluteSpeech как вариант
4. Админская настройка `extra_config.salute_voice` из `AISettingsManager` никак не читается в клиентском коде озвучивания

## План исправления

### 1. Расширить `TTSSettings` (TTSSettingsDialog.tsx)

```ts
interface TTSSettings {
  provider: 'elevenlabs' | 'salutespeech' | 'browser';
  voiceId: string;           // ElevenLabs voice
  saluteVoice: string;       // SaluteSpeech voice (natalya, boris, etc.)
}
```

Обратная совместимость: при чтении из localStorage, если `useElevenLabs === true` → `provider: 'elevenlabs'`, иначе → `provider: 'browser'`.

### 2. Обновить `TTSSettingsDialog` UI

- Заменить Switch «Использовать ElevenLabs» на Select с тремя провайдерами: ElevenLabs, SaluteSpeech (Sber), Браузер
- При выборе ElevenLabs — показывать выбор голоса ElevenLabs (как сейчас)
- При выборе SaluteSpeech — показывать выбор голоса SaluteSpeech (natalya, boris, marfa и т.д.)
- При выборе Браузер — показывать информацию о встроенном синтезе

### 3. Добавить хук `useSaluteSpeechTTS` или расширить `speakText()`

В `useCourseLearning.ts` добавить третью ветку в `speakText()`:

```ts
if (ttsSettings.provider === 'salutespeech') {
  // fetch salutespeech-tts edge function с voice = ttsSettings.saluteVoice
} else if (ttsSettings.provider === 'elevenlabs') {
  elevenLabsTTS.speak(text);
} else {
  // browser speech synthesis
}
```

### 4. Файлы для изменения

- `src/components/student/TTSSettingsDialog.tsx` — новый интерфейс, Select провайдера, голоса SaluteSpeech
- `src/hooks/useCourseLearning.ts` — добавить SaluteSpeech ветку в `speakText()`, состояние загрузки
- `src/pages/CourseLearning.tsx` — минимальные правки если нужны для нового состояния

