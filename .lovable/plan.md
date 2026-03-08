

## План: Telegram-уведомление о новых заявках на курс

### Проблема
Сейчас `notify-course-order` отправляет только email. Нужно добавить Telegram-уведомление администратору при поступлении заявки.

### Решение
Добавить в edge function `notify-course-order` отправку Telegram-сообщения через `TELEGRAM_BOT_TOKEN` + `TELEGRAM_SUPPORT_CHAT_ID` (уже настроены и используются в других функциях).

### Формат сообщения
```
🛒 Новая заявка на курс!

📚 Курс: Охрана труда при работах на высоте (2 группа)
👤 Покупатель: ИП Васин С.В.
📋 Тип: Организация
👥 Студентов: 1
💰 Цена: 5 000 ₽
```

### Изменения
Один файл: `supabase/functions/notify-course-order/index.ts` — после отправки email добавить блок отправки в Telegram (аналогично `send-telegram-notification`). Если `TELEGRAM_BOT_TOKEN` или `TELEGRAM_SUPPORT_CHAT_ID` не настроены — молча пропустить.

