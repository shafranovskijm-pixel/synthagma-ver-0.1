

# Исправление: Хранилище не показывает файлы организации

## Проблема

Компонент `StorageManager` сканирует только бакеты `course-files` и `course-videos`, причём только по папкам с ID курсов. Он не знает о других бакетах, где хранятся файлы организации:

- `presentations` (109 файлов) -- презентации курсов
- `org-documents` (5) -- документы организации  
- `company-documents` (3) -- документы компаний
- `org-branding` (19) -- логотипы, штампы, подписи
- `library-files` (1) -- библиотека материалов
- `billing-documents` (2) -- платёжные документы
- `student-documents` (8) -- документы студентов (приватный бакет)

## Решение

Расширить `StorageManager`, чтобы он сканировал все бакеты, связанные с организацией.

### Шаг 1. Добавить сканирование дополнительных бакетов

В функцию `loadFiles` добавить загрузку файлов из:

1. **`presentations`** -- файлы в папке `{organizationId}/` (презентации загружаются по org ID)
2. **`org-documents`** -- файлы в папке `{organizationId}/`
3. **`company-documents`** -- файлы в папке `{organizationId}/`
4. **`org-branding`** -- файлы в папке `{organizationId}/`
5. **`library-files`** -- файлы в папке `library/{organizationId}/`
6. **`billing-documents`** -- файлы в папке `{organizationId}/`

`student-documents` -- приватный бакет с PII, его показывать не нужно в общем хранилище.

### Шаг 2. Универсальная функция сканирования

Создать вспомогательную функцию, которая принимает бакет и список путей для сканирования, и возвращает массив `StorageFile[]`. Это уберёт дублирование кода.

```text
scanBucket("presentations", [organizationId])
scanBucket("org-documents", [organizationId + "/contract", organizationId + "/invoice", ...])
scanBucket("org-branding", [organizationId])
scanBucket("library-files", ["library/" + organizationId])
scanBucket("billing-documents", [organizationId])
scanBucket("company-documents", [organizationId])
```

### Шаг 3. Рекурсивный обход подпапок

Некоторые бакеты используют подпапки (например `org-documents/{orgId}/contract/`). Добавить рекурсивный обход до 2 уровней вложенности, чтобы найти все файлы.

### Файл для изменения

- `src/components/organization/StorageManager.tsx` -- расширить функцию `loadFiles`

