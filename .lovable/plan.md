

# Исправление отображения пароля в карточке ученика

## Проблема
На странице `/organization/student/:studentId` в разделе «Учетные данные для входа» пароль отображается в зашифрованном виде (`ENC:ww0EBwMCQ/5+KGlc0...`) вместо реального пароля.

## Причина
В `src/pages/OrganizationStudentDetails.tsx` (строки 116-137) пароль читается напрямую из таблицы `profiles.generated_password`, где он хранится в зашифрованном виде (`ENC:...`). Для расшифровки нужно использовать RPC `get_decrypted_student_password` (или `get_decrypted_student_passwords`) — как это уже сделано в `useOrganizationDashboard.ts`, `api/students.ts`, `api/courses.ts`.

## Исправление

В `src/pages/OrganizationStudentDetails.tsx` в `useEffect` загрузки ученика:

1. После получения профиля — вызвать RPC `get_decrypted_student_password({ p_user_id: profile.user_id })` параллельно с загрузкой курсов.
2. Использовать расшифрованный пароль в `setStudent({ ..., generated_password: decryptedPw || null })`.
3. Если RPC вернёт ошибку или пусто — оставить `null` (не показывать `ENC:...`).

## Технические детали
- RPC `get_decrypted_student_password(p_user_id)` уже существует в БД и возвращает `text`, проверяет роль вызывающего (admin/organization владелец).
- Никаких изменений в БД, миграциях или других файлах не требуется — точечное исправление одного места.

