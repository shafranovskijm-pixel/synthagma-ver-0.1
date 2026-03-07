

# Функционал вебинаров со встроенной трансляцией

## Архитектура

Для встроенной видеотрансляции нужен WebRTC-сервис — браузер не может самостоятельно обеспечить многопользовательскую трансляцию с записью. Оптимальный вариант — **Daily.co** (простой iframe-embed, API для записи, бесплатный тариф до 100 участников).

```text
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Org Dashboard   │────▶│ Edge Function │────▶│  Daily.co   │
│  (создание)      │     │ (create room) │     │  (WebRTC)   │
└─────────────────┘     └──────────────┘     └─────────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────┐                         ┌─────────────┐
│  DB: webinars    │                         │  Запись →   │
│  (метаданные)    │                         │  Storage    │
└─────────────────┘                         └─────────────┘
         │
         ▼
┌─────────────────┐
│  Student view    │ ← iframe embed Daily.co room
│  (просмотр)      │
└─────────────────┘
```

## База данных

### Таблица `webinars`
```
id, organization_id, title, description, 
course_id (nullable — привязка к курсу),
company_id (nullable — привязка к компании),
access_type ('enrolled' | 'org_all' | 'course' | 'company'),
scheduled_at, duration_minutes,
status ('scheduled' | 'live' | 'ended'),
room_url (Daily.co room URL),
room_name (Daily.co room name),
recording_url (nullable — после записи),
recording_size_bytes,
host_user_id,
max_participants,
created_at, updated_at
```

### Таблица `webinar_participants`
```
id, webinar_id, user_id, 
joined_at, left_at,
role ('host' | 'viewer')
```

### RLS-политики
- Организация: CRUD на свои вебинары
- Студенты: SELECT по `access_type` (enrolled → проверка enrollments, company → проверка company_id, org_all → проверка organization_id)
- Admin: полный доступ

## Реализация — 7 задач

### 1. Секрет Daily.co API Key
Запросить у пользователя API-ключ Daily.co (бесплатная регистрация на daily.co).

### 2. Миграция БД
Создать таблицы `webinars` и `webinar_participants` с RLS-политиками и индексами.

### 3. Edge Function `manage-webinar`
- `POST` — создать комнату через Daily.co API, сохранить в БД
- `PATCH` — обновить/завершить вебинар
- `DELETE` — удалить комнату и запись
- `GET /token` — сгенерировать токен участника (Daily.co meeting token)

### 4. Вкладка «Вебинары» в OrgSidebar
- Новый TabType `"webinars"`
- Пункт меню с иконкой `Video`
- Feature category `webinars` в системе подписок

### 5. Компонент `WebinarsManager`
- Список предстоящих / завершённых вебинаров
- Создание: название, описание, дата, привязка к курсу/компании, тип доступа
- Кнопка «Начать трансляцию» → открывает Daily.co room в iframe
- После завершения: загрузка записи или импорт из Daily.co
- Просмотр участников

### 6. Просмотр для студентов
- Вкладка «Вебинары» в StudentDashboard (список доступных)
- Кнопка «Подключиться» → Daily.co iframe embed
- Архив записей с плеером

### 7. Хранение записей
- Загрузка записей в бакет `webinar-recordings` (приватный)
- Подписанные URL для просмотра (1 час)
- Учёт в квоте хранилища организации

## Ключевое ограничение
Для работы трансляций необходим API-ключ Daily.co. Без него функционал будет работать только в режиме «планирование + загрузка записей вручную».

