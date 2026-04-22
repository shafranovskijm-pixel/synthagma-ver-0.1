---
name: Broadcast email mailing
description: Система рассылок в админ-панели — SMTP, email_action_tokens, продающие шаблоны Sintagma, fallback орг для админа в CreateWebinarQuick
type: feature
---

Система рассылок в админ-панели (вкладка «Рассылка») позволяет отправлять организациям шаблонизированные письма через прямой SMTP (edge `send-email`). Кнопки в письмах ведут на `/email-response?token=...`, где `email_action_tokens` отслеживают клики и создают `admin_notifications`.

## Шаблоны (src/components/admin/broadcast/emailTemplates.ts)

7 шаблонов в фирменной палитре Teal/Cyan (#1AAB9B):
- `inactive`, `welcome` — служебные
- `cold` — холодное знакомство (4 буллета + CTA)
- `presentation` — большой продающий шаблон с блоками: «Что даёт платформа» (200+ программ, ИИ-конструктор, ФИС ФРДО, видео), «Документооборот», «Безопасность 54/63/152-ФЗ», «Тарифы»
- `followup` — материалы после встречи
- `proposal` — КП с карточкой условий и сроком 14 дней
- `reactivation` — анонс новых функций (ИИ-аватар, Документы 4.0, Сделки 360°)

Все продающие шаблоны содержат футер «Ответьте СТОП для отписки» (юридическая защита от спам-жалоб). Переменные: `{{name}}`, `{{action_url}}`.

В БД `email_templates` те же 5 продающих шаблонов синхронизированы как `scope='platform' is_default=true` для UI «Шаблоны email».

## CreateWebinarQuick fallback

`src/components/admin/broadcast/CreateWebinarQuick.tsx`: для платформенного админа без `profiles.organization_id` показывается `Select` со списком организаций. Выбор сохраняется в `localStorage('broadcast_webinar_org_id')`.

## Слабые места (на будущее)

UTM-метки, A/B темы, автосохранение черновика, валидация HTML, планировщик `send_at`, расширение переменных (`{{org_name}}`, `{{plan}}`), inbox-превью.
