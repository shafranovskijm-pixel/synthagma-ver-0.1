# UC027 — адресат Classic API

При ошибке Novofon Classic API прежний код повторял запрос с подписью и параметрами на адрес другого сервиса. Теперь запрос остаётся в исходном api.novofon.com, построенный URL проверяется перед подписью, перенаправления запрещены. Повтор с другим настроенным ключом на том же сервере сохранён. Закрытое сообщение ошибки не содержит тела ответа, параметров или ключей. Call API/Data API и их выбор сохранены.

Validation:14 ordinary cases against real shared source and a second actual14 run with the portable repository-layout configuration. Independent GET/POST signing goldens, forbidden origins/redirects, same-host key order, closed error payloads, unchanged Call/Data API routes. No real call, provider credentials or customer data used.

Open separately: inbound notification signature contract, original-actor authority in four handlers, and actual SIP/WebRTC account configuration. This change does not certify provider locality, agreements or all telephony paths.
