# UC027 — права на четыре операции телефонии

Общий SIP/операторский доступ, диагностика и создание звонка теперь требуют действующего исходного пользователя и существующих полномочий администратора либо менеджера платформы. Получение записи сначала читает выбранный call_log под исходным JWT и действующими RLS; сервисный ключ не подменяет это решение. Необязательное обращение проверяется тем же пользователем до платного запроса. Аудит использует подтверждённого пользователя; ошибки и журналы выбранных обработчиков закрывают приватные данные.

Validation:47 ordinary offline whole-handler cases, existing role/RLS metadata, no new role, schema, JWT setting or frontend change. Original owned-record access retained independently of global operator role. Real phone calls, vendor credentials, recording fetches and customer data not used.

Still open: actual inbound notification signature protocol and SIP/WebRTC recipient configuration; primary/backup locality, provider agreements and deletion evidence. This release is a bounded authority fix, not overall legal-compliance acceptance.
