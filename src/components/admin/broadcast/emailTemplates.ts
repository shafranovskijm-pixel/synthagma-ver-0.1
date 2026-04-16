/** Email HTML templates for broadcast mailing */

export function getInactiveEmailHtml(orgName: string, actionUrl: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
        <h1 style="font-size: 22px; color: #1a1a1a; margin: 0 0 20px;">Здравствуйте!</h1>
        <p style="font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 16px;">
          Мы заметили, что вы давно не заходили на платформу <strong>Sintagma</strong>.
        </p>
        <p style="font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 16px;">
          Если вам нужна помощь в настройке или консультация по работе с платформой — мы с радостью поможем! Нажмите кнопку ниже, и мы свяжемся с вами.
        </p>
        <p style="font-size: 14px; color: #888; line-height: 1.6; margin: 0 0 28px;">
          Если платформа вам больше не нужна, ваш аккаунт может быть деактивирован через 30 дней.
        </p>
        <div style="text-align: center;">
          <a href="${actionUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Мне нужна помощь
          </a>
        </div>
        <p style="font-size: 12px; color: #aaa; margin: 28px 0 0; text-align: center;">
          Платформа Sintagma — sintagma.com.ru
        </p>
      </div>
    </div>
  `;
}

export function getWelcomeEmailHtml(orgName: string, actionUrl: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
        <h1 style="font-size: 22px; color: #1a1a1a; margin: 0 0 20px;">Добро пожаловать!</h1>
        <p style="font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 16px;">
          Спасибо за регистрацию на платформе <strong>Sintagma</strong>!
        </p>
        <p style="font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 28px;">
          Если вам нужна консультация по настройке платформы или у вас есть вопросы — нажмите кнопку ниже, и мы свяжемся с вами.
        </p>
        <div style="text-align: center;">
          <a href="${actionUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Запросить консультацию
          </a>
        </div>
        <p style="font-size: 12px; color: #aaa; margin: 28px 0 0; text-align: center;">
          Платформа Sintagma — sintagma.com.ru
        </p>
      </div>
    </div>
  `;
}

export function getEmailHtml(template: "inactive" | "welcome", orgName: string, actionUrl: string): string {
  return template === "inactive" ? getInactiveEmailHtml(orgName, actionUrl) : getWelcomeEmailHtml(orgName, actionUrl);
}

export function getEmailSubject(template: "inactive" | "welcome"): string {
  return template === "inactive"
    ? "Мы заметили, что вы давно не заходили — Sintagma"
    : "Добро пожаловать на платформу Sintagma!";
}
