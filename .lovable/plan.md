

# Единый профиль + приватность в чате + переименование вкладки

## Что будет сделано

### 1. Переименовать «Настройки ЛК» → «ЛК ученика»
В `OrgSettingsContent.tsx` убрать слово «Настройки» — вкладка станет просто «ЛК ученика».

### 2. Синхронизация профиля: ЛК ученика ↔ Чат
Сейчас `ChatSettingsPanel.tsx` загружает аватар в бакет `avatars`, а `StudentProfileContent.tsx` — в `student-documents`. Нужно унифицировать:
- `ChatSettingsPanel` будет использовать тот же `avatar_url` из `profiles`, что и `StudentProfileContent`
- Загрузка аватара в чате обновляет `profiles.avatar_url` → профиль ученика сразу подхватывает
- В `ChatSettingsPanel` показывать те же поля (ФИО, телефон, город, о себе) из `profiles`, только в режиме просмотра (без редактирования — для этого есть профиль)

### 3. Настройки приватности в чате
Добавить в `ChatSettingsPanel` переключатели «Что видно другим в чате»:
- Показывать телефон (вкл/выкл)
- Показывать ФИО (вкл/выкл)  
- Показывать город (вкл/выкл)
- Показывать «О себе» (вкл/выкл)

Хранение: новая колонка `chat_privacy` (jsonb, default `{}`) в таблице `profiles`. Формат: `{ "hide_phone": true, "hide_name": false, ... }`.

При отображении профиля в чате (клик на аватар собеседника) — проверять эти настройки и скрывать поля.

## Технические детали

### Миграция
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chat_privacy jsonb DEFAULT '{}'::jsonb;
```

### Файлы

| Действие | Файл |
|----------|------|
| Миграция | Колонка `chat_privacy` в `profiles` |
| Изменить | `src/components/organization/tabs/OrgSettingsContent.tsx` — «Настройки ЛК» → «ЛК ученика» |
| Изменить | `src/components/chat/ChatSettingsPanel.tsx` — подтянуть данные из `profiles`, добавить переключатели приватности, унифицировать загрузку аватара |
| Изменить | `src/components/chat/OrgGeneralChat.tsx` — при клике на участника учитывать `chat_privacy` |

