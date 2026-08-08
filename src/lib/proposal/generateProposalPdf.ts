import {
  PROPOSAL_CONDITIONS,
  PROPOSAL_CONTACTS,
  PROPOSAL_LAUNCH_PROMISE,
  PROPOSAL_LEGAL_LINKS,
  PROPOSAL_MODULES,
  PROPOSAL_NEXT_STEPS,
  PROPOSAL_PDF_FILE_NAME,
  PROPOSAL_WORKFLOW,
  getPublicPlanSummaries,
} from "./proposalContent";

/**
 * Единый генератор PDF коммерческого предложения СИНТАГМЫ.
 *
 * Каждая страница верстается ровно в размер A4 (794 × 1123 px при 96 dpi)
 * и рендерится отдельно — поэтому нет обрезки контента и пустых страниц.
 * Текст растеризуется браузером, поэтому кириллица и переносы корректны.
 */

const A4_W = 794;
const A4_H = 1123;

const TEAL = "#0f8c7e";
const INK = "#111827";
const MUTED = "#4b5563";
const LINE = "#e5e7eb";
const SOFT = "#f3f7f6";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pageShell(inner: string, footer: string): string {
  return `
    <div style="width:${A4_W}px;height:${A4_H}px;box-sizing:border-box;padding:52px 56px 46px;background:#ffffff;color:${INK};font-family:'PT Sans',Inter,Arial,sans-serif;display:flex;flex-direction:column;">
      <div style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column;">${inner}</div>
      <div style="flex:0 0 auto;border-top:1px solid ${LINE};padding-top:10px;font-size:10.5px;color:${MUTED};display:flex;justify-content:space-between;">
        <span>СИНТАГМА · ${esc(PROPOSAL_CONTACTS.site)}</span>
        <span>${esc(footer)}</span>
      </div>
    </div>`;
}

function h1(text: string): string {
  return `<div style="font-size:34px;line-height:1.15;font-weight:700;color:${INK};margin:0 0 14px;">${esc(text)}</div>`;
}

function h2(text: string): string {
  return `<div style="font-size:22px;line-height:1.2;font-weight:700;color:${TEAL};margin:0 0 6px;">${esc(text)}</div>`;
}

function lead(text: string): string {
  return `<div style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 22px;">${esc(text)}</div>`;
}

/** Чистая функция: HTML страниц КП без побочных эффектов. */
export function buildProposalPagesHtml(): string[] {
  const plans = getPublicPlanSummaries();
  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  // 1. Обложка
  const cover = pageShell(
    `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:64px;">
      <div style="width:44px;height:44px;border-radius:12px;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;">Σ</div>
      <div>
        <div style="font-size:18px;font-weight:700;letter-spacing:0.04em;">СИНТАГМА</div>
        <div style="font-size:11px;color:${MUTED};">Образовательная платформа</div>
      </div>
    </div>
    <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${TEAL};margin-bottom:14px;">Коммерческое предложение</div>
    ${h1("Учебный центр целиком в одной системе")}
    <div style="font-size:15px;line-height:1.7;color:${MUTED};max-width:600px;">
      Курсы, ученики, документы, журналы и подготовка данных для ФИС ФРДО — без разрозненных таблиц
      и отдельных сервисов. ${esc(PROPOSAL_LAUNCH_PROMISE)}.
    </div>
    <div style="margin-top:44px;display:flex;gap:14px;">
      ${[
        { t: "Один кабинет", d: "обучение и документооборот" },
        { t: "7 дней", d: "до запуска первой группы" },
        { t: "0 ₽", d: "постоянный бесплатный тариф" },
      ]
        .map(
          (c) => `<div style="flex:1;border:1px solid ${LINE};border-radius:16px;padding:18px;background:${SOFT};">
            <div style="font-size:19px;font-weight:700;color:${TEAL};">${esc(c.t)}</div>
            <div style="font-size:12px;color:${MUTED};margin-top:4px;">${esc(c.d)}</div>
          </div>`,
        )
        .join("")}
    </div>
    <div style="margin-top:52px;border:1px solid ${LINE};border-radius:16px;padding:20px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px;">Что вы получите</div>
      <div style="font-size:12.5px;line-height:1.7;color:${MUTED};">
        Прозрачный процесс от создания программы до выдачи документов, снижение ручной работы методиста
        и администратора, единая база учеников и готовые шаблоны документов вашей организации.
      </div>
    </div>
    <div style="margin-top:26px;border:1px solid ${LINE};border-radius:16px;padding:20px;background:${SOFT};">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;">Что внутри предложения</div>
      <div style="font-size:12.5px;line-height:1.9;color:${MUTED};">
        Стр. 2 — сквозной сценарий работы учебного центра<br/>
        Стр. 3 — ключевые модули платформы и их доступность по тарифам<br/>
        Стр. 4 — тарифы, лимиты и условия оплаты<br/>
        Стр. 5 — порядок запуска, контакты и юридические документы
      </div>
    </div>
    <div style="margin-top:26px;font-size:12.5px;line-height:1.8;color:${MUTED};">
      Сайт: ${esc(PROPOSAL_CONTACTS.site)} · Почта: ${esc(PROPOSAL_CONTACTS.email)}
    </div>
    <div style="margin-top:auto;padding-top:36px;padding-bottom:18px;font-size:11.5px;color:${MUTED};">
      Дата формирования: ${esc(today)} · Исполнитель: ${esc(PROPOSAL_CONTACTS.executor)}, ИНН ${esc(PROPOSAL_CONTACTS.inn)}
    </div>`,

    "Стр. 1",
  );

  // 2. Сценарий работы
  const workflow = pageShell(
    `
    ${h2("Как это работает")}
    ${lead("Один сквозной сценарий: курс → группа и ученики → обучение → документы и журналы → подготовка ФИС ФРДО.")}
    ${PROPOSAL_WORKFLOW.map(
      (s) => `
      <div style="display:flex;gap:16px;padding:16px 0;border-bottom:1px solid ${LINE};">
        <div style="flex:0 0 38px;height:38px;border-radius:12px;background:${TEAL};color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;">${esc(s.step)}</div>
        <div>
          <div style="font-size:15px;font-weight:700;margin-bottom:3px;">${esc(s.title)}</div>
          <div style="font-size:12.5px;line-height:1.65;color:${MUTED};max-width:600px;">${esc(s.text)}</div>
        </div>
      </div>`,
    ).join("")}
    <div style="margin-top:26px;border-left:3px solid ${TEAL};background:${SOFT};padding:14px 16px;font-size:12px;line-height:1.65;color:${MUTED};">
      ФИС ФРДО: платформа выполняет проверку и подготовку данных и файла к выгрузке. На тарифе
      «Профессиональный» действует ФРДО+ — выгрузку выполняем за вас.
    </div>`,
    "Стр. 2",
  );

  // 3. Ключевые модули
  const modules = pageShell(
    `
    ${h2("Ключевые модули")}
    ${lead("Состав функций зависит от тарифа — доступность указана рядом с каждым модулем.")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      ${PROPOSAL_MODULES.map(
        (m) => `
        <div style="border:1px solid ${LINE};border-radius:16px;padding:16px;">
          <div style="font-size:14px;font-weight:700;margin-bottom:5px;">${esc(m.title)}</div>
          <div style="font-size:12px;line-height:1.6;color:${MUTED};">${esc(m.text)}</div>
          ${m.plans ? `<div style="margin-top:9px;font-size:10.5px;color:${TEAL};font-weight:700;">${esc(m.plans)}</div>` : ""}
        </div>`,
      ).join("")}
    </div>`,
    "Стр. 3",
  );

  // 4. Тарифы и условия
  const pricing = pageShell(
    `
    ${h2("Тарифы и условия")}
    ${lead("Актуальные публичные тарифы. Цены указаны за месяц, оплата за год — со скидкой 15%.")}
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:9px 8px;background:${SOFT};border:1px solid ${LINE};font-weight:700;">Тариф</th>
          <th style="text-align:left;padding:9px 8px;background:${SOFT};border:1px solid ${LINE};font-weight:700;">Стоимость</th>
          <th style="text-align:left;padding:9px 8px;background:${SOFT};border:1px solid ${LINE};font-weight:700;">Курсы</th>
          <th style="text-align:left;padding:9px 8px;background:${SOFT};border:1px solid ${LINE};font-weight:700;">Ученики</th>
          <th style="text-align:left;padding:9px 8px;background:${SOFT};border:1px solid ${LINE};font-weight:700;">Обучений в месяц</th>
          <th style="text-align:left;padding:9px 8px;background:${SOFT};border:1px solid ${LINE};font-weight:700;">Хранилище</th>
        </tr>
      </thead>
      <tbody>
        ${plans
          .map(
            (p) => `
          <tr>
            <td style="padding:9px 8px;border:1px solid ${LINE};font-weight:700;">${esc(p.name)}${p.recommended ? ` <span style="color:${TEAL};font-weight:700;">· рекомендуем</span>` : ""}</td>
            <td style="padding:9px 8px;border:1px solid ${LINE};">${esc(p.priceLabel)}${p.yearlyLabel ? `<div style="color:${MUTED};font-size:10.5px;margin-top:2px;">${esc(p.yearlyLabel)}</div>` : ""}</td>
            <td style="padding:9px 8px;border:1px solid ${LINE};">${esc(p.courses)}</td>
            <td style="padding:9px 8px;border:1px solid ${LINE};">${esc(p.students)}</td>
            <td style="padding:9px 8px;border:1px solid ${LINE};">${esc(p.trainedPerMonth)}</td>
            <td style="padding:9px 8px;border:1px solid ${LINE};">${esc(p.storage)}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${plans
        .map(
          (p) => `
        <div style="border:1px solid ${p.recommended ? TEAL : LINE};border-radius:16px;padding:14px;">
          <div style="font-size:13.5px;font-weight:700;">${esc(p.name)}</div>
          <div style="font-size:11px;color:${MUTED};margin-bottom:8px;">${esc(p.description)}</div>
          ${p.features
            .map(
              (f) =>
                `<div style="font-size:11.5px;line-height:1.6;color:${MUTED};">· ${esc(f)}</div>`,
            )
            .join("")}
        </div>`,
        )
        .join("")}
    </div>

    <div style="margin-top:18px;border:1px solid ${LINE};border-radius:16px;padding:14px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px;">Условия</div>
      ${PROPOSAL_CONDITIONS.map(
        (c) => `<div style="font-size:11.5px;line-height:1.65;color:${MUTED};">· ${esc(c)}</div>`,
      ).join("")}
    </div>`,
    "Стр. 4",
  );

  // 5. Следующий шаг и контакты
  const contacts = pageShell(
    `
    ${h2("Следующий шаг")}
    ${lead("Начать можно без оплаты: бесплатный тариф доступен постоянно.")}
    ${PROPOSAL_NEXT_STEPS.map(
      (s, i) => `
      <div style="display:flex;gap:14px;padding:13px 0;border-bottom:1px solid ${LINE};">
        <div style="flex:0 0 30px;height:30px;border-radius:10px;background:${SOFT};color:${TEAL};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${i + 1}</div>
        <div style="font-size:12.5px;line-height:1.6;color:${MUTED};padding-top:5px;">${esc(s)}</div>
      </div>`,
    ).join("")}

    <div style="margin-top:30px;border:1px solid ${TEAL};border-radius:18px;padding:20px;background:${SOFT};">
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">Контакты</div>
      <div style="font-size:12.5px;line-height:1.8;color:${MUTED};">
        Сайт: ${esc(PROPOSAL_CONTACTS.site)}<br/>
        Почта: ${esc(PROPOSAL_CONTACTS.email)}<br/>
        Исполнитель: ${esc(PROPOSAL_CONTACTS.executor)}, ИНН ${esc(PROPOSAL_CONTACTS.inn)}
      </div>
    </div>

    <div style="margin-top:20px;border:1px solid ${LINE};border-radius:16px;padding:18px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px;">Открыть КП онлайн</div>
      <div style="font-size:12.5px;line-height:1.7;color:${MUTED};">
        Всегда актуальная версия предложения с тарифами и лимитами:<br/>
        ${esc(PROPOSAL_CONTACTS.siteUrl + PROPOSAL_ONLINE_PATH)}
      </div>
    </div>

    <div style="margin-top:20px;font-size:11px;line-height:1.7;color:${MUTED};">
      Юридические документы:<br/>
      ${PROPOSAL_LEGAL_LINKS.map(
        (l) => `${esc(l.label)} — ${esc(PROPOSAL_CONTACTS.siteUrl + l.href)}`,
      ).join("<br/>")}
    </div>
    <div style="margin-top:auto;padding-top:28px;font-size:11px;line-height:1.7;color:${MUTED};">
      Предложение носит информационный характер и не является публичной офертой. Состав функций и лимиты
      определяются выбранным тарифом и условиями договора-оферты на ${esc(PROPOSAL_CONTACTS.site)}.
    </div>`,

    "Стр. 5",
  );

  return [cover, workflow, modules, pricing, contacts];
}

/** Генерирует и скачивает PDF КП. Работает с любой страницы, без перехода на /proposal/platform. */
export async function generateProposalPdf(): Promise<void> {
  const pages = buildProposalPagesHtml();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${A4_W}px;background:#fff;z-index:-1;`;
  host.innerHTML = pages.map((p) => `<div data-proposal-page>${p}</div>`).join("");
  document.body.appendChild(host);

  try {
    if ((document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {
        /* ignore */
      }
    }

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();

    const nodes = Array.from(host.querySelectorAll<HTMLElement>("[data-proposal-page]"));
    for (let i = 0; i < nodes.length; i++) {
      const canvas = await html2canvas(nodes[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: A4_W,
        logging: false,
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, pw, ph, undefined, "FAST");
    }

    pdf.save(PROPOSAL_PDF_FILE_NAME);
  } finally {
    host.remove();
  }
}
