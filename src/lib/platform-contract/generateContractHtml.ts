import { OPERATOR } from "@/constants/operatorDetails";
import { formatRub } from "./derive";
import type { PlatformContractDraft } from "./types";

/**
 * Единый генератор HTML проекта договора СИНТАГМЫ.
 * Используется публичной страницей, кабинетом заказчика и админкой.
 *
 * Страница верстается точно в A4 (794 × 1123 px при 96 dpi), каждая страница —
 * отдельный блок `.a4-page` с принудительным разрывом печати.
 */

export const A4_W = 794;
export const A4_H = 1123;

export const PROJECT_WATERMARK_TEXT = "ПРОЕКТ — НЕ ПОДПИСАН";
export const PROJECT_BADGE_TEXT = "ПРОЕКТ · НЕ ПОДПИСАН";
export const CONTRACT_HEADER_TEXT = "СИНТАГМА · Проект договора";

const TEAL = "#0f8c7e";
const INK = "#111827";
const MUTED = "#4b5563";
const LINE = "#e5e7eb";
const SOFT = "#f3f7f6";

const PLACEHOLDER_CUSTOMER = "Организация-заказчик";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Значение реквизита заказчика или подчёркнутый placeholder. */
function field(value: string | undefined, placeholder: string): string {
  const v = (value ?? "").trim();
  if (v) return escapeHtml(v);
  return `<span style="display:inline-block;min-width:120px;border-bottom:1px solid #9ca3af;color:#9ca3af;">${escapeHtml(placeholder)}</span>`;
}

export function formatContractDateRu(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  if (!y || !m || !d) return iso;
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y} г.`;
}

function periodLabel(months: number): string {
  return months === 12 ? "12 (двенадцать) месяцев" : "1 (один) месяц";
}

function page(inner: string, index: number, total: number): string {
  return `
  <div class="a4-page" data-contract-page="${index}" style="position:relative;width:${A4_W}px;height:${A4_H}px;box-sizing:border-box;padding:44px 56px 40px;background:#ffffff;color:${INK};font-family:'PT Sans',Inter,Arial,sans-serif;font-size:12.5px;line-height:1.6;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page;">
    <div data-project-watermark aria-hidden="true" style="position:absolute;left:50%;top:52%;transform:translate(-50%,-50%) rotate(-24deg);font-size:56px;font-weight:700;letter-spacing:0.08em;color:rgba(15,140,126,0.08);white-space:nowrap;pointer-events:none;">${escapeHtml(PROJECT_WATERMARK_TEXT)}</div>
    <div style="position:relative;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid ${TEAL};padding-bottom:9px;margin-bottom:18px;">
      <div style="display:flex;align-items:center;gap:9px;">
        <div style="width:26px;height:26px;border-radius:8px;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">Σ</div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(CONTRACT_HEADER_TEXT)}</div>
      </div>
      <div style="font-size:9.5px;font-weight:700;letter-spacing:0.12em;color:${TEAL};border:1px solid ${TEAL};border-radius:999px;padding:3px 9px;">${escapeHtml(PROJECT_BADGE_TEXT)}</div>
    </div>
    <div style="position:relative;flex:1 1 auto;min-height:0;">${inner}</div>
    <div style="position:relative;flex:0 0 auto;border-top:1px solid ${LINE};margin-top:14px;padding-top:8px;display:flex;justify-content:space-between;font-size:9.5px;color:${MUTED};">
      <span>${escapeHtml(CONTRACT_HEADER_TEXT)}</span>
      <span>Страница ${index} из ${total}</span>
    </div>
  </div>`;
}

function h1(text: string): string {
  return `<div style="font-size:27px;line-height:1.2;font-weight:700;margin:0 0 8px;">${escapeHtml(text)}</div>`;
}

function h2(num: number, text: string): string {
  return `<div style="font-size:15px;font-weight:700;color:${TEAL};margin:0 0 8px;">${num}. ${escapeHtml(text)}</div>`;
}

function clause(num: string, text: string): string {
  return `<div style="display:flex;gap:8px;margin-bottom:6px;"><span style="flex:0 0 34px;color:${MUTED};">${escapeHtml(num)}</span><span style="flex:1 1 auto;text-align:justify;">${text}</span></div>`;
}

function accentNote(text: string): string {
  return `<div style="border-left:3px solid ${TEAL};background:${SOFT};padding:10px 12px;margin-top:12px;font-size:11.5px;color:${MUTED};">${text}</div>`;
}

function requisitesCard(title: string, rows: string[]): string {
  return `
  <div style="flex:1 1 0;min-width:0;border:1px solid ${LINE};border-radius:14px;padding:14px;">
    <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${TEAL};font-weight:700;margin-bottom:8px;">${escapeHtml(title)}</div>
    ${rows.map((r) => `<div style="font-size:11px;line-height:1.65;color:${INK};margin-bottom:2px;">${r}</div>`).join("")}
  </div>`;
}

/** Чистая функция: массив HTML страниц проекта договора. */
export function buildPlatformContractPagesHtml(draft: PlatformContractDraft): string[] {
  const total = 7;
  const dateRu = formatContractDateRu(draft.date);
  const c = draft.customer;
  const customerName = (c.name ?? "").trim() || PLACEHOLDER_CUSTOMER;
  const isFree = draft.monthlyPrice === 0;

  const priceRows = isFree
    ? [
        ["Тариф", `${escapeHtml(draft.planName)} (бесплатный)`],
        ["Период", periodLabel(draft.periodMonths)],
        ["Стоимость периода", "0 ₽"],
      ]
    : [
        ["Тариф", escapeHtml(draft.planName)],
        ["Стоимость по тарифу", `${formatRub(draft.monthlyPrice)} за месяц`],
        ["Период", periodLabel(draft.periodMonths)],
        [
          "Скидка",
          draft.discountRate > 0
            ? `${Math.round(draft.discountRate * 100)}% при оплате за 12 месяцев — ${formatRub(draft.discountAmount)}`
            : "не применяется",
        ],
        ["Цена за месяц с учётом скидки", formatRub(draft.effectiveMonthlyPrice)],
        ["Итого к оплате за период", `<b>${formatRub(draft.totalAmount)}</b>`],
      ];

  // 1. Обложка и стороны
  const p1 = page(
    `
    <div style="font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:${TEAL};margin-bottom:10px;">Проект для согласования</div>
    ${h1("Договор о предоставлении доступа к образовательной платформе СИНТАГМА")}
    <div style="font-size:12.5px;color:${MUTED};margin-bottom:26px;">Дата формирования проекта: ${escapeHtml(dateRu)}. Номер договору не присваивается до подписания сторонами.</div>
    <div style="height:2px;background:${TEAL};opacity:0.6;margin-bottom:22px;"></div>
    <div style="display:flex;gap:14px;">
      ${requisitesCard("Исполнитель", [
        `<b>${escapeHtml(OPERATOR.fullName)}</b>`,
        `ИНН ${escapeHtml(OPERATOR.inn)}`,
        `ОГРНИП ${escapeHtml(OPERATOR.ogrnip)}`,
        escapeHtml(OPERATOR.address),
        `${escapeHtml(OPERATOR.email)} · ${escapeHtml(OPERATOR.phone)}`,
      ])}
      ${requisitesCard("Заказчик", [
        `<b>${field(c.name, PLACEHOLDER_CUSTOMER)}</b>`,
        `ИНН ${field(c.inn, "ИНН")}`,
        `КПП ${field(c.kpp, "КПП")} · ОГРН ${field(c.ogrn, "ОГРН")}`,
        field(c.address, "юридический адрес"),
        `${field(c.email, "e-mail")} · ${field(c.phone, "телефон")}`,
      ])}
    </div>
    ${accentNote(
      "Настоящий документ является проектом и не создаёт обязательств сторон. Реквизиты заказчика заполняются в кабинете организации либо согласуются перед подписанием.",
    )}
    <div style="margin-top:26px;border:1px solid ${LINE};border-radius:14px;padding:14px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Состав документа</div>
      <div style="font-size:11.5px;line-height:1.85;color:${MUTED};">
        Стр. 2 — предмет договора и состав тарифа<br/>
        Стр. 3 — права и обязанности сторон<br/>
        Стр. 4 — стоимость, порядок оплаты и срок действия<br/>
        Стр. 5 — конфиденциальность, персональные данные, ответственность<br/>
        Стр. 6 — спецификация услуг и лимитов<br/>
        Стр. 7 — реквизиты сторон и подписи
      </div>
    </div>
    <div style="margin-top:auto;padding-top:22px;font-size:11px;color:${MUTED};">
      Платформа: sintagma.com.ru · Тариф проекта: ${escapeHtml(draft.planName)} · Период: ${periodLabel(draft.periodMonths)}
    </div>`,
    1,
    total,
  );

  // 2. Предмет и состав тарифа
  const p2 = page(
    `
    ${h2(1, "Предмет договора")}
    ${clause("1.1.", `Исполнитель предоставляет Заказчику доступ к облачной образовательной платформе СИНТАГМА (далее — Платформа) на условиях простой (неисключительной) лицензии — права использования Платформы по её функциональному назначению, а Заказчик оплачивает доступ в соответствии с выбранным тарифом.`)}
    ${clause("1.2.", `Доступ предоставляется в виде программного сервиса: экземпляр программы Заказчику не передаётся, установка на оборудование Заказчика не производится.`)}
    ${clause("1.3.", `Выбранный тариф: <b>${escapeHtml(draft.planName)}</b>${draft.planDescription ? ` — ${escapeHtml(draft.planDescription)}` : ""}. Состав функций и лимиты определяются тарифом и приведены в спецификации (раздел 6).`)}
    ${clause("1.4.", `В состав услуг входит техническое сопровождение Платформы: консультации по работе кабинета, устранение выявленных ошибок, обновления функций в рамках тарифа.`)}
    ${clause("1.5.", `Хранение материалов Заказчика (курсы, документы, медиафайлы) осуществляется в пределах объёма хранилища, установленного тарифом.`)}
    ${clause("1.6.", `В отношении ФИС ФРДО Платформа выполняет проверку и подготовку данных и файла к выгрузке. На тарифах «Профессиональный» и «Максимальный» действует ФИС ФРДО+ — выгрузка сведений выполняется Исполнителем по поручению Заказчика. Передача сведений в ФИС ФРДО осуществляется только по поручению Заказчика и без его участия не выполняется.`)}
    ${clause("1.7.", `Исполнитель не является образовательной организацией и не оказывает образовательных услуг обучающимся Заказчика. Ответственность за содержание учебных программ и выдаваемых документов несёт Заказчик.`)}

    <div style="margin-top:16px;">${h2(2, "Состав тарифа")}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      ${draft.features
        .map(
          (f) =>
            `<div style="border:1px solid ${LINE};border-radius:12px;padding:9px 11px;font-size:11.5px;line-height:1.5;">${escapeHtml(f)}</div>`,
        )
        .join("")}
    </div>
    ${accentNote(
      "Проект не включает обязательную миграцию данных из сторонних систем, индивидуальную разработку и гарантию непрерывной доступности в процентах. Такие работы согласуются отдельно.",
    )}`,
    2,
    total,
  );

  // 3. Права и обязанности
  const p3 = page(
    `
    ${h2(3, "Права и обязанности сторон")}
    <div style="font-size:12px;font-weight:700;margin:2px 0 6px;">Исполнитель обязан:</div>
    ${clause("3.1.", "предоставить Заказчику доступ к кабинету организации в срок не позднее 3 (трёх) рабочих дней с даты подписания договора и поступления оплаты по выбранному тарифу (для бесплатного тарифа — с даты регистрации кабинета);")}
    ${clause("3.2.", "обеспечивать работоспособность Платформы и устранять выявленные ошибки в разумный срок, а также сохранять материалы Заказчика в пределах лимитов тарифа;")}
    ${clause("3.3.", "консультировать уполномоченных сотрудников Заказчика по вопросам работы Платформы по электронной почте и в чате поддержки;")}
    ${clause("3.4.", "уведомлять Заказчика о плановых технических работах, если они существенно ограничивают доступ.")}
    <div style="font-size:12px;font-weight:700;margin:12px 0 6px;">Заказчик обязан:</div>
    ${clause("3.5.", "использовать Платформу в соответствии с её назначением и законодательством Российской Федерации, не передавать доступ третьим лицам вне своей организации;")}
    ${clause("3.6.", "обеспечивать конфиденциальность учётных данных своих сотрудников и обучающихся и незамедлительно сообщать о случаях компрометации доступа;")}
    ${clause("3.7.", "самостоятельно определять содержание учебных программ, состав обучающихся и выдаваемых документов, а также достоверность вносимых сведений;")}
    ${clause("3.8.", "оплачивать доступ в порядке и сроки, установленные разделом 4.")}
    <div style="font-size:12px;font-weight:700;margin:12px 0 6px;">Стороны вправе:</div>
    ${clause("3.9.", "Заказчик — в любой момент изменить тариф; изменение вступает в силу с начала следующего оплаченного периода, если стороны не согласовали иное;")}
    ${clause("3.10.", "Исполнитель — приостановить доступ при нарушении Заказчиком порядка оплаты или условий использования Платформы, предварительно уведомив Заказчика;")}
    ${clause("3.11.", "Исполнитель — развивать функциональность Платформы, не уменьшая при этом объём услуг, оплаченных Заказчиком по действующему тарифу.")}`,
    3,
    total,
  );

  // 4. Стоимость и срок
  const p4 = page(
    `
    ${h2(4, "Стоимость услуг и порядок оплаты")}
    ${clause("4.1.", "Стоимость доступа определяется выбранным тарифом Платформы и указана в таблице ниже.")}
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin:10px 0 4px;">
      <tbody>
        ${priceRows
          .map(
            ([k, v]) => `
          <tr>
            <td style="border:1px solid ${LINE};padding:8px 10px;background:${SOFT};width:45%;">${escapeHtml(k)}</td>
            <td style="border:1px solid ${LINE};padding:8px 10px;">${v}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    ${clause("4.2.", isFree ? "Тариф не предполагает оплаты. При переходе на платный тариф стоимость определяется по действующим тарифам Платформы на дату перехода." : "Оплата производится авансом за выбранный период на основании счёта Исполнителя. Датой оплаты считается дата поступления денежных средств на счёт Исполнителя.")}
    ${clause("4.3.", "Скидка 15% применяется при оплате доступа сразу за 12 месяцев. Скидка рассчитывается от действующей тарифной цены и не суммируется с индивидуальными условиями, если иное не согласовано сторонами.")}
    ${clause("4.4.", "Исполнитель применяет специальный налоговый режим; налог на добавленную стоимость не начисляется.")}
    ${clause("4.5.", "Акт об оказанных услугах формируется по окончании оплаченного периода. При отсутствии мотивированных возражений в течение 5 (пяти) рабочих дней услуги считаются принятыми.")}

    <div style="margin-top:16px;">${h2(5, "Срок действия и порядок изменения")}</div>
    ${clause("5.1.", `Договор действует с даты подписания сторонами. Оплаченный период доступа составляет ${periodLabel(draft.periodMonths)}.`)}
    ${clause("5.2.", "Если ни одна из сторон не заявила о прекращении не позднее чем за 10 (десять) дней до окончания периода, договор продлевается на такой же период на действующих тарифных условиях.")}
    ${clause("5.3.", "Заказчик вправе отказаться от договора, уведомив Исполнителя письменно; неиспользованная часть аванса возвращается пропорционально остатку оплаченного периода.")}
    ${clause("5.4.", "После прекращения договора материалы Заказчика доступны для выгрузки в течение 30 (тридцати) календарных дней, после чего могут быть удалены.")}
    ${accentNote("Настоящая страница проекта отражает расчёт по действующим тарифам на дату формирования и может быть пересчитана при изменении тарифа или периода.")}`,
    4,
    total,
  );

  // 5. Конфиденциальность, ПДн, ответственность
  const p5 = page(
    `
    ${h2(6, "Конфиденциальность")}
    ${clause("6.1.", "Стороны обязуются не раскрывать третьим лицам сведения, полученные в связи с исполнением договора, включая содержание учебных материалов, данные обучающихся и коммерческие условия.")}
    ${clause("6.2.", "Обязательство сохраняется в течение 3 (трёх) лет после прекращения договора.")}

    <div style="margin-top:14px;">${h2(7, "Обработка персональных данных")}</div>
    ${clause("7.1.", "Заказчик является оператором персональных данных своих сотрудников и обучающихся и определяет цели и состав их обработки.")}
    ${clause("7.2.", "Заказчик поручает Исполнителю обработку персональных данных в объёме, необходимом для предоставления доступа к Платформе: хранение, систематизация, извлечение, использование в интерфейсе кабинета, подготовка отчётных форм и документов.")}
    ${clause("7.3.", "Исполнитель обрабатывает персональные данные исключительно по поручению Заказчика, не раскрывает их третьим лицам и применяет организационные и технические меры защиты, включая разграничение доступа и шифрование чувствительных полей.")}
    ${clause("7.4.", "Обработка осуществляется на территории Российской Федерации в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».")}
    ${clause("7.5.", "По требованию Заказчика Исполнитель прекращает обработку и удаляет персональные данные, если сохранение не требуется по закону.")}

    <div style="margin-top:14px;">${h2(8, "Ответственность и обстоятельства непреодолимой силы")}</div>
    ${clause("8.1.", "Стороны несут ответственность в соответствии с законодательством Российской Федерации.")}
    ${clause("8.2.", "Исполнитель не отвечает за перерывы в доступе, вызванные действиями операторов связи, провайдеров Заказчика, средств защиты информации на стороне Заказчика, а также за содержание материалов, размещённых Заказчиком.")}
    ${clause("8.3.", "Ответственность Исполнителя ограничена суммой оплаты за период, в котором произошло нарушение.")}
    ${clause("8.4.", "Стороны освобождаются от ответственности при наступлении обстоятельств непреодолимой силы, уведомив другую сторону в течение 5 (пяти) рабочих дней.")}

    <div style="margin-top:14px;">${h2(9, "Прочие условия")}</div>
    ${clause("9.1.", "Стороны признают юридическую силу документов, подписанных электронной подписью и направленных с адресов, указанных в реквизитах.")}
    ${clause("9.2.", "Споры разрешаются путём переговоров, а при недостижении согласия — в суде по месту нахождения Исполнителя.")}`,
    5,
    total,
  );

  // 6. Спецификация
  const p6 = page(
    `
    ${h2(10, "Спецификация услуг и лимитов")}
    <div style="font-size:11.5px;color:${MUTED};margin-bottom:10px;">Приложение к проекту договора. Лимиты приведены по тарифу «${escapeHtml(draft.planName)}» на ${escapeHtml(dateRu)}.</div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
      <thead>
        <tr>
          <th style="border:1px solid ${LINE};background:${SOFT};padding:8px 10px;text-align:left;">№</th>
          <th style="border:1px solid ${LINE};background:${SOFT};padding:8px 10px;text-align:left;">Показатель</th>
          <th style="border:1px solid ${LINE};background:${SOFT};padding:8px 10px;text-align:left;">Значение по тарифу</th>
        </tr>
      </thead>
      <tbody>
        ${[
          ["Курсы (программы обучения)", draft.limits.courses],
          ["Ученики в кабинете", draft.limits.students],
          ["Завершённых обучений в месяц", draft.limits.trainedPerMonth],
          ["Объём хранилища", draft.limits.storage],
          ["Период доступа", periodLabel(draft.periodMonths)],
          ["Стоимость периода", isFree ? "0 ₽" : formatRub(draft.totalAmount)],
        ]
          .map(
            ([k, v], i) => `
          <tr>
            <td style="border:1px solid ${LINE};padding:8px 10px;">${i + 1}</td>
            <td style="border:1px solid ${LINE};padding:8px 10px;">${escapeHtml(k)}</td>
            <td style="border:1px solid ${LINE};padding:8px 10px;">${escapeHtml(v)}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <div style="margin-top:16px;font-size:12px;font-weight:700;margin-bottom:6px;">Функции, входящие в тариф</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      ${draft.features
        .map(
          (f) =>
            `<div style="border:1px solid ${LINE};border-radius:12px;padding:9px 11px;font-size:11.5px;line-height:1.5;">${escapeHtml(f)}</div>`,
        )
        .join("")}
    </div>
    ${accentNote(
      "Дополнительно по отдельному согласованию: 3D-тренажёры, помощь в переносе материалов, доработки под процессы Заказчика.",
    )}`,
    6,
    total,
  );

  // 7. Реквизиты и подписи
  const p7 = page(
    `
    ${h2(11, "Реквизиты и подписи сторон")}
    <div style="display:flex;gap:14px;margin-bottom:18px;">
      ${requisitesCard("Исполнитель", [
        `<b>${escapeHtml(OPERATOR.fullName)}</b>`,
        `ИНН ${escapeHtml(OPERATOR.inn)} · ОГРНИП ${escapeHtml(OPERATOR.ogrnip)}`,
        escapeHtml(OPERATOR.address),
        `Банк: ${escapeHtml(OPERATOR.bankName)}`,
        `Р/с ${escapeHtml(OPERATOR.bankAccount)}`,
        `БИК ${escapeHtml(OPERATOR.bik)} · К/с ${escapeHtml(OPERATOR.corrAccount)}`,
        `${escapeHtml(OPERATOR.email)} · ${escapeHtml(OPERATOR.phone)}`,
      ])}
      ${requisitesCard("Заказчик", [
        `<b>${field(c.name, PLACEHOLDER_CUSTOMER)}</b>`,
        `ИНН ${field(c.inn, "ИНН")} · КПП ${field(c.kpp, "КПП")}`,
        `ОГРН ${field(c.ogrn, "ОГРН")}`,
        field(c.address, "юридический адрес"),
        `${field(c.signatoryPosition, "должность")} — ${field(c.signatoryName, "ФИО подписанта")}`,
        `действует на основании ${field(c.signatoryBasis, "устава")}`,
        `${field(c.email, "e-mail")} · ${field(c.phone, "телефон")}`,
      ])}
    </div>

    <div style="display:flex;gap:14px;">
      <div style="flex:1 1 0;min-width:0;">
        <div style="font-size:11px;color:${MUTED};margin-bottom:34px;">От Исполнителя</div>
        <div style="border-top:1px solid #9ca3af;padding-top:5px;font-size:10.5px;color:${MUTED};">подпись · ${escapeHtml(OPERATOR.shortName)}</div>
        <div style="margin-top:6px;font-size:10px;color:#9ca3af;">место для печати</div>
      </div>
      <div style="flex:1 1 0;min-width:0;">
        <div style="font-size:11px;color:${MUTED};margin-bottom:34px;">От Заказчика</div>
        <div style="border-top:1px solid #9ca3af;padding-top:5px;font-size:10.5px;color:${MUTED};">подпись · ${field(c.signatoryName, "ФИО подписанта")}</div>
        <div style="margin-top:6px;font-size:10px;color:#9ca3af;">место для печати</div>
      </div>
    </div>

    ${accentNote(
      `Документ сформирован ${escapeHtml(dateRu)} как проект для согласования. Подписи и печати не проставлены, номер договора присваивается при подписании.`,
    )}
    <div style="margin-top:auto;padding-top:20px;font-size:10.5px;color:${MUTED};">
      Платформа СИНТАГМА · sintagma.com.ru · ${escapeHtml(OPERATOR.email)}${draft.projectId ? ` · внутренний идентификатор проекта: ${escapeHtml(draft.projectId)}` : ""}
    </div>`,
    7,
    total,
  );

  return [p1, p2, p3, p4, p5, p6, p7];
}

/** Полный HTML-документ проекта договора (для печати и предпросмотра). */
export function buildPlatformContractDocumentHtml(draft: PlatformContractDraft): string {
  const pages = buildPlatformContractPagesHtml(draft);
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8" />
<title>${escapeHtml(CONTRACT_HEADER_TEXT)} · ${escapeHtml(draft.planName)}</title>
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; background: #f3f4f6; }
  .a4-page { margin: 0 auto 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
  @media print { body { background: #fff; } .a4-page { box-shadow: none; margin: 0; } }
</style>
</head><body>${pages.join("")}</body></html>`;
}

/** Имя файла PDF проекта договора. */
export function platformContractFileName(draft: PlatformContractDraft): string {
  return `SINTAGMA-contract-project-${draft.plan}-${draft.date}.pdf`;
}
