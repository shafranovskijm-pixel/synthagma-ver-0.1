---
name: Student PEP + PD consent flow
description: В кабинете ученика два независимых документа — Соглашение об использовании ПЭП и Согласие на обработку ПД, подписывается ПЭП без повторного пароля
type: feature
---

В кабинете ученика (`StudentDocumentsTab`) два независимых документа:

1. **Соглашение об использовании ПЭП** — карточка `StudentPepAgreementCard` всегда сверху. Принимается через `PepAgreementDialog` («Я ознакомился и принимаю») → запись в `pep_agreements` (текст, версия `PEP_AGREEMENT_VERSION` = `v1.0`, IP, UA). Скачивается PDF со штампом через `printHtmlContent` + `buildPepAgreementPdfHtml`.
2. **Согласие на обработку ПД** (`StudentConsentForm`) — подписывается ПЭП БЕЗ повторного ввода пароля (факт авторизации = ключ ПЭП). Кнопка «Подписать ПЭП» disabled, пока не принято Соглашение об использовании ПЭП той же версии. Insert в `student_consents` обогащён: `policy_version` (`СПД-v1.0`, константа `CONSENT_VERSION`), `purposes` (массив целей), `ip_address` (через edge `get-client-ip`), `user_agent`, `email`. После подписи — `PepSignatureStamp` + кнопка «Скачать (PDF)» через `buildConsentPdfHtml`.

IP получается через публичную edge `get-client-ip` (`x-forwarded-for` / `cf-connecting-ip`).
