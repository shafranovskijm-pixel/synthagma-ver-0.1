/**
 * Переводит технические сообщения об ошибках регистрации/входа в понятный русский текст.
 * Используется в JoinByLink, Login, ResetPassword — везде, где показывается тост об ошибке.
 */
export function humanizeAuthError(raw: unknown): string {
  const msg = String((raw as any)?.message || raw || "").trim();
  if (!msg) return "Не удалось выполнить запрос. Попробуйте ещё раз.";
  const lower = msg.toLowerCase();

  // Специфичные для register-student
  if (lower.includes("invalid authentication") || lower.includes("authentication required")) {
    return "Ссылка регистрации недействительна или устарела. Попросите новую у организации.";
  }
  if (lower.includes("insufficient permissions")) {
    return "Недостаточно прав для регистрации по этой ссылке.";
  }
  if (lower.includes("profile_not_found") || lower.includes("ваша сессия устарела")) {
    return "Ваша сессия устарела. Выйдите из аккаунта и попробуйте снова.";
  }
  if (lower.includes("registration link") || lower.includes("link not found") || lower.includes("link expired")) {
    return "Ссылка регистрации не найдена или срок её действия истёк.";
  }
  if (lower.includes("student_limit_exceeded") || lower.includes("лимит тарифа")) {
    return "Организация достигла лимита учеников. Обратитесь к администратору.";
  }

  // Общие ошибки Supabase Auth
  if (lower.includes("already registered") || lower.includes("user already") || lower.includes("email_exists") || lower.includes("уже существует") || lower.includes("уже занят")) {
    return "Пользователь с такими данными уже зарегистрирован. Войдите в существующий аккаунт.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Слишком много попыток. Подождите пару минут и попробуйте снова.";
  }
  if (lower.includes("weak_password") || (lower.includes("password") && lower.includes("short"))) {
    return "Пароль слишком простой: минимум 6 символов, добавьте буквы и цифры.";
  }
  if (lower.includes("invalid login credentials") || lower.includes("invalid credentials")) {
    return "Неверный логин или пароль.";
  }
  if (lower.includes("email_address_invalid") || (lower.includes("invalid") && lower.includes("email"))) {
    return "Неверный формат email. Проверьте адрес и попробуйте снова.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
    return "Нет соединения с сервером. Проверьте интернет/VPN и повторите.";
  }
  if (lower.includes("timeout") || lower.includes("auth_timeout")) {
    return "Сервис авторизации не отвечает. Попробуйте через минуту.";
  }
  if (lower.includes("email not confirmed")) {
    return "Email не подтверждён. Проверьте почту и перейдите по ссылке подтверждения.";
  }

  // Если пришёл уже локализованный русский текст — вернём как есть
  if (/[а-яё]/i.test(msg)) return msg;

  return "Не удалось выполнить запрос: " + msg;
}
