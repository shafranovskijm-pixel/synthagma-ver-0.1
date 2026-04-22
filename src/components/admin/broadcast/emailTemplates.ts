/** Email HTML templates for broadcast mailing — Sintagma platform */

const TEAL = "#1AAB9B"; // HSL 174 72% 46% — фирменный Teal/Cyan
const TEAL_DARK = "#138577";
const INK = "#0F172A";
const SOFT = "#475569";
const MUTED = "#94A3B8";
const BG = "#F8FAFC";
const CARD_RADIUS = "16px";
const FOOTER = `
  <p style="font-size: 11px; color: ${MUTED}; margin: 20px 0 0; text-align: center; line-height: 1.5;">
    Платформа Sintagma — <a href="https://sintagma.com.ru" style="color: ${MUTED}; text-decoration: underline;">sintagma.com.ru</a><br/>
    Если вы не хотите получать письма от Sintagma — ответьте на это письмо словом «СТОП».
  </p>
`;

function shell(inner: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${BG}; padding: 32px 16px;">
      <div style="max-width: 640px; margin: 0 auto;">
        <div style="background: white; border-radius: ${CARD_RADIUS}; padding: 36px; box-shadow: 0 2px 12px rgba(15,23,42,0.06);">
          ${inner}
        </div>
        ${FOOTER}
      </div>
    </div>
  `;
}

function ctaButton(url: string, label: string): string {
  return `
    <div style="text-align: center; margin: 28px 0 8px;">
      <a href="${url}" style="display: inline-block; background: ${TEAL}; color: white; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(26,171,155,0.25);">
        ${label}
      </a>
    </div>
  `;
}

function feature(icon: string, title: string, desc: string): string {
  return `
    <tr>
      <td style="padding: 14px 0; vertical-align: top; width: 48px;">
        <div style="width: 40px; height: 40px; background: ${TEAL}15; border-radius: 10px; text-align: center; line-height: 40px; font-size: 20px;">${icon}</div>
      </td>
      <td style="padding: 14px 0 14px 14px; vertical-align: top;">
        <div style="font-size: 15px; font-weight: 600; color: ${INK}; margin: 0 0 4px;">${title}</div>
        <div style="font-size: 14px; color: ${SOFT}; line-height: 1.55;">${desc}</div>
      </td>
    </tr>
  `;
}

function sectionTitle(text: string): string {
  return `<h2 style="font-size: 16px; font-weight: 700; color: ${INK}; margin: 28px 0 8px; padding-top: 8px; border-top: 1px solid #E2E8F0;">${text}</h2>`;
}

// ───────────────── Шаблон 1: Inactive (служебный, был ранее) ─────────────────
export function getInactiveEmailHtml(orgName: string, actionUrl: string): string {
  return shell(`
    <h1 style="font-size: 22px; color: ${INK}; margin: 0 0 16px; font-weight: 700;">Здравствуйте!</h1>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Мы заметили, что вы давно не заходили на платформу <strong style="color:${INK}">Sintagma</strong>.
    </p>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Если вам нужна помощь в настройке или консультация — мы поможем. Нажмите кнопку, и мы свяжемся с вами.
    </p>
    <p style="font-size: 14px; color: ${MUTED}; line-height: 1.6; margin: 0 0 12px;">
      Если платформа вам больше не нужна, аккаунт может быть деактивирован через 30 дней.
    </p>
    ${ctaButton(actionUrl, "Мне нужна помощь")}
  `);
}

// ───────────────── Шаблон 2: Welcome (служебный) ─────────────────
export function getWelcomeEmailHtml(orgName: string, actionUrl: string): string {
  return shell(`
    <h1 style="font-size: 22px; color: ${INK}; margin: 0 0 16px; font-weight: 700;">Добро пожаловать в Sintagma!</h1>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Спасибо за регистрацию. Платформа уже готова к работе — вы можете создавать курсы, приглашать учеников и выпускать документы об образовании.
    </p>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Нужна помощь со стартом? Мы проведём бесплатную 30-минутную презентацию и поможем настроить платформу под ваши задачи.
    </p>
    ${ctaButton(actionUrl, "Запросить консультацию")}
  `);
}

// ───────────────── Шаблон 3: Cold — первое касание ─────────────────
export function getColdEmailHtml(orgName: string, actionUrl: string): string {
  return shell(`
    <h1 style="font-size: 24px; color: ${INK}; margin: 0 0 12px; font-weight: 700;">Добрый день${orgName ? ", " + orgName : ""}!</h1>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Меня зовут <strong style="color:${INK}">команда Sintagma</strong> — мы делаем образовательную платформу полного цикла для учебных центров и предприятий.
    </p>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Коротко, что умеет платформа:
    </p>
    <ul style="font-size: 14px; color: ${SOFT}; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
      <li>200+ готовых программ ДПО, ПО и «Рабочих профессий» — можно сразу обучать</li>
      <li>ИИ-конструктор: курс из 35 уроков создаётся за 5 минут</li>
      <li>Авто-выпуск удостоверений и отчётность ФИС ФРДО без Excel вручную</li>
      <li>Видеохостинг с защитой от скачивания + вебинары</li>
    </ul>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 8px;">
      Удобно ли вам короткий 20-минутный созвон, чтобы я показал платформу на вашей задаче?
    </p>
    ${ctaButton(actionUrl, "Запланировать встречу")}
  `);
}

// ───────────────── Шаблон 4: Presentation — продающее, главное ─────────────────
export function getPresentationEmailHtml(orgName: string, actionUrl: string): string {
  return shell(`
    <div style="text-align: center; margin: 0 0 24px;">
      <div style="display: inline-block; background: linear-gradient(135deg, ${TEAL}, ${TEAL_DARK}); color: white; font-size: 12px; font-weight: 700; letter-spacing: 1px; padding: 6px 14px; border-radius: 999px; text-transform: uppercase;">
        Презентация платформы
      </div>
    </div>
    <h1 style="font-size: 26px; color: ${INK}; margin: 0 0 12px; font-weight: 700; text-align: center; line-height: 1.25;">
      Sintagma — образовательная платформа полного цикла
    </h1>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 24px; text-align: center;">
      Для учебных центров, корпоративных университетов и охраны труда на предприятии${orgName ? `. Подготовили подборку специально для <strong style="color:${INK}">${orgName}</strong>` : ""}.
    </p>

    ${sectionTitle("🚀 Что даёт платформа")}
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 0 0 8px;">
      ${feature("🎓", "200+ готовых программ", "Маркетплейс ДПО, ПО и «Рабочих профессий» — обучайте сразу, без разработки с нуля.")}
      ${feature("🤖", "ИИ-конструктор курсов", "GigaChat + Gemini: курс из 35 уроков по 700+ слов и тестами за 5 минут.")}
      ${feature("📊", "ФИС ФРДО автоматически", "Excel 35/41 колонка, форматирование СНИЛС и дат — без ручной работы.")}
      ${feature("🎬", "Видео и вебинары", "Видеохостинг Kinescope с DRM и защитой от скачивания + LiveKit для вебинаров.")}
    </table>

    ${sectionTitle("📑 Документооборот под ключ")}
    <ul style="font-size: 14px; color: ${SOFT}; line-height: 1.8; padding-left: 20px; margin: 8px 0 0;">
      <li>Авто-выпуск удостоверений и дипломов при 100% прогресса ученика</li>
      <li>Электронная подпись (63-ФЗ), журналы регистрации, корзина с восстановлением</li>
      <li>Договоры, КП, счета, акты сверки — генерация в Word/PDF из реквизитов</li>
      <li>Массовая генерация документов по шаблонам с переменными</li>
    </ul>

    ${sectionTitle("🛡 Безопасность и соответствие")}
    <ul style="font-size: 14px; color: ${SOFT}; line-height: 1.8; padding-left: 20px; margin: 8px 0 0;">
      <li>Шифрование персональных данных (паспорта, СНИЛС) на уровне БД</li>
      <li>Соответствие 54-ФЗ, 63-ФЗ, 152-ФЗ</li>
      <li>Серверная проверка тестов — ученик не увидит правильные ответы</li>
      <li>Гранулярные права для сотрудников + 2FA для администраторов</li>
    </ul>

    ${sectionTitle("💰 Гибкость тарифов")}
    <p style="font-size: 14px; color: ${SOFT}; line-height: 1.7; margin: 8px 0 0;">
      <strong style="color:${INK}">Free Forever</strong> — до 10 учеников бесплатно, без срока.
      Ещё 4 тарифа — от Старта до Максимального. Кастомные лимиты — по запросу.
    </p>

    ${ctaButton(actionUrl, "Перейти к встрече")}

    <p style="font-size: 13px; color: ${MUTED}; line-height: 1.6; margin: 16px 0 0; text-align: center;">
      Если ссылка не открывается — ответьте на это письмо, мы пришлём новое приглашение.
    </p>
  `);
}

// ───────────────── Шаблон 5: Follow-up — после презентации ─────────────────
export function getFollowupEmailHtml(orgName: string, actionUrl: string): string {
  return shell(`
    <h1 style="font-size: 22px; color: ${INK}; margin: 0 0 16px; font-weight: 700;">Спасибо за встречу!</h1>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Было приятно познакомиться${orgName ? " с командой " + orgName : ""}. Как и договаривались, отправляю материалы:
    </p>
    <ul style="font-size: 14px; color: ${SOFT}; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
      <li>Сравнение тарифов и лимиты по ученикам</li>
      <li>Каталог 200+ готовых программ ДПО и ПО</li>
      <li>Презентация ИИ-конструктора курсов</li>
      <li>Чек-лист по миграции существующих курсов</li>
    </ul>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Готов ответить на любые вопросы и помочь с подбором тарифа. Когда удобно созвониться повторно?
    </p>
    ${ctaButton(actionUrl, "Открыть материалы")}
  `);
}

// ───────────────── Шаблон 6: Proposal — отправка КП ─────────────────
export function getProposalEmailHtml(orgName: string, actionUrl: string): string {
  return shell(`
    <h1 style="font-size: 22px; color: ${INK}; margin: 0 0 16px; font-weight: 700;">Коммерческое предложение</h1>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      ${orgName ? `Для <strong style="color:${INK}">${orgName}</strong> подготовили` : "Подготовили"} персональное предложение по платформе Sintagma.
    </p>
    <div style="background: ${BG}; border-left: 4px solid ${TEAL}; padding: 16px 20px; border-radius: 8px; margin: 16px 0;">
      <p style="font-size: 14px; color: ${INK}; margin: 0 0 8px; font-weight: 600;">Что входит в КП:</p>
      <ul style="font-size: 14px; color: ${SOFT}; line-height: 1.7; padding-left: 18px; margin: 0;">
        <li>Подобранный тариф и стоимость на год</li>
        <li>Список включённых программ обучения</li>
        <li>Лимиты по ученикам, курсам и хранилищу</li>
        <li>Условия миграции и поддержки</li>
      </ul>
    </div>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Предложение действует 14 дней. Готов обсудить детали и скорректировать условия под ваши задачи.
    </p>
    ${ctaButton(actionUrl, "Открыть предложение")}
  `);
}

// ───────────────── Шаблон 7: Reactivation — спящие клиенты ─────────────────
export function getReactivationEmailHtml(orgName: string, actionUrl: string): string {
  return shell(`
    <h1 style="font-size: 22px; color: ${INK}; margin: 0 0 16px; font-weight: 700;">Давно не виделись${orgName ? ", " + orgName : ""}!</h1>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 16px;">
      Sintagma за это время сильно прокачалась. Самое интересное:
    </p>
    <ul style="font-size: 14px; color: ${SOFT}; line-height: 1.8; padding-left: 20px; margin: 0 0 16px;">
      <li><strong style="color:${INK}">ИИ-аватар</strong> — голосовой преподаватель прямо в уроке</li>
      <li><strong style="color:${INK}">Документы 4.0</strong> — версионирование, корзина, KPI документооборота</li>
      <li><strong style="color:${INK}">Сделки 360°</strong> — тайм-лайн всех касаний с клиентом</li>
      <li><strong style="color:${INK}">Сотрудники с правами</strong> — гранулярная матрица + 2FA</li>
    </ul>
    <p style="font-size: 15px; color: ${SOFT}; line-height: 1.7; margin: 0 0 8px;">
      Загляните — возможно, нужного раньше функционала уже ждёт вас в кабинете.
    </p>
    ${ctaButton(actionUrl, "Что нового на платформе")}
  `);
}

// ───────────────── Роутер шаблонов ─────────────────
export type BroadcastTemplate =
  | "inactive"
  | "welcome"
  | "cold"
  | "presentation"
  | "followup"
  | "proposal"
  | "reactivation";

export function getEmailHtml(template: BroadcastTemplate, orgName: string, actionUrl: string): string {
  switch (template) {
    case "inactive": return getInactiveEmailHtml(orgName, actionUrl);
    case "welcome": return getWelcomeEmailHtml(orgName, actionUrl);
    case "cold": return getColdEmailHtml(orgName, actionUrl);
    case "presentation": return getPresentationEmailHtml(orgName, actionUrl);
    case "followup": return getFollowupEmailHtml(orgName, actionUrl);
    case "proposal": return getProposalEmailHtml(orgName, actionUrl);
    case "reactivation": return getReactivationEmailHtml(orgName, actionUrl);
  }
}

export function getEmailSubject(template: BroadcastTemplate): string {
  switch (template) {
    case "inactive": return "Мы заметили, что вы давно не заходили — Sintagma";
    case "welcome": return "Добро пожаловать на платформу Sintagma!";
    case "cold": return "Sintagma — образовательная платформа для УЦ и предприятий";
    case "presentation": return "Презентация платформы Sintagma — что внутри";
    case "followup": return "Материалы после встречи — Sintagma";
    case "proposal": return "Коммерческое предложение — Sintagma";
    case "reactivation": return "Что нового на Sintagma — возвращайтесь";
  }
}
