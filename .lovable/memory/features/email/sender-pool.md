---
name: Email sender pool
description: Пул почтовых ящиков для рассылок из edge functions с ротацией round-robin и суточным лимитом
type: feature
---
Таблица `email_sender_pool` (email, app_password, host/port/encryption, from_name, is_active, priority, daily_limit, sends_today, sends_reset_at, last_used_at, last_error).
RLS: только admin (`has_role admin`); service_role — полный доступ.
RPC `pick_next_email_sender()` (SECURITY DEFINER, service_role only): LRU-выбор активного ящика под лимитом с `FOR UPDATE SKIP LOCKED`, инкрементит sends_today и last_used_at. Сброс sends_today по дате.
RPC `mark_email_sender_result(id, error?)` — отметка ошибки/успеха.
UI: admin → Настройки → «Пул email-отправителей» (`src/components/admin/EmailSenderPoolManager.tsx`) — таблица с редактированием app-паролей, включением, лимитами; предупреждение что Google требует app-passwords (не web-пароли).
Стартовый seed: 20 ящиков `@yi.mannni.com` (Google Workspace, MX → smtp.google.com), созданы неактивными — их web-пароли Google по SMTP не работают (BadCredentials 535), нужны app-passwords.
