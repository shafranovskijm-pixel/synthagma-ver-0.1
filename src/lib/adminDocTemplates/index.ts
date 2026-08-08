import { OPERATOR } from "@/constants/operatorDetails";
import stampImg from "@/assets/sintagma-stamp.png";
import signatureImg from "@/assets/sintagma-signature.png";

export type AdminDocType =
  | "paid_contract"
  | "free_contract"
  | "pdn_consent"
  | "mixed_package";

export type CounterpartyKind = "legal" | "ip" | "individual";

export type SubscriptionPlanKey = "start" | "standard" | "professional" | "maximum" | "free";

export interface AdminDocVariables {
  doc_number: string;
  doc_date: string; // ISO YYYY-MM-DD
  counterparty_kind: CounterpartyKind;
  counterparty_name: string;
  counterparty_inn?: string;
  counterparty_kpp?: string;
  counterparty_ogrn?: string;
  counterparty_address?: string;
  counterparty_signatory?: string;
  counterparty_signatory_position?: string;
  counterparty_email?: string;
  counterparty_phone?: string;
  // Для физлица
  individual_passport?: string;
  individual_birthdate?: string;
  // Для договоров
  plan?: SubscriptionPlanKey;
  subject?: string;
  amount?: string; // сумма прописью/цифрой
  term?: string;
  // Для согласий
  purposes?: string;
  duration?: string;
}

const PLAN_CORE_FUNCTIONS =
  "личные кабинеты Заказчика и слушателей, размещение и прохождение образовательных курсов, цифровая библиотека учебных и методических материалов, видеоматериалы и защищённое воспроизведение через Kinescope, видеоидентификация слушателей, ведение данных слушателей, контроль прогресса обучения, тестирование, электронные журналы и отчёты, чек-лист документов, подготовка данных для ФИС ФРДО, настройки порядка прохождения курсов, брендирование кабинета Заказчика, инструменты охраны труда, ИИ-генерация и ИИ-озвучка учебных материалов, email-рассылки и сервисные уведомления";

export const PLAN_LABELS: Record<SubscriptionPlanKey, string> = {
  start: "Старт",
  standard: "Стандарт",
  professional: "Профессиональный",
  maximum: "Максимальный",
  free: "Бесплатный",
};

export const PLAN_CONTRACT_SUBJECTS: Record<SubscriptionPlanKey, string> = {
  start: `предоставление Заказчику и слушателям Заказчика доступа к образовательной платформе «СИНТАГМА» по тарифу «Старт» в режиме 24/7, за исключением времени проведения регламентных, профилактических и аварийно-восстановительных работ, с использованием функционала платформы: ${PLAN_CORE_FUNCTIONS}. В рамках тарифа «Старт» Заказчику предоставляется возможность использовать до 15 курсов, до 100 слушателей, до 60 завершивших обучение слушателей в месяц и до 3 ГБ хранилища данных`,
  standard: `предоставление Заказчику и слушателям Заказчика доступа к образовательной платформе «СИНТАГМА» по тарифу «Стандарт» в режиме 24/7 с использованием функционала платформы: ${PLAN_CORE_FUNCTIONS}, а также расширенных лимитов по количеству курсов, слушателей и объёма хранилища согласно тарифному плану, действующему на дату подписания Договора`,
  professional: `предоставление Заказчику и слушателям Заказчика доступа к образовательной платформе «СИНТАГМА» по тарифу «Профессиональный» в режиме 24/7 с использованием полного функционала платформы: ${PLAN_CORE_FUNCTIONS}, включая расширенные ИИ-инструменты, вебинары, интеграции и приоритетную техническую поддержку, а также расширенных лимитов по количеству курсов, слушателей и объёма хранилища согласно тарифному плану`,
  maximum: `предоставление Заказчику и слушателям Заказчика доступа к образовательной платформе «СИНТАГМА» по тарифу «Максимальный» в режиме 24/7 с использованием полного функционала платформы без ограничений по количеству курсов, слушателей и объёма хранилища (в пределах, установленных тарифом): ${PLAN_CORE_FUNCTIONS}, включая ИИ-инструменты, вебинары, интеграции, приоритетную техническую поддержку и индивидуальные доработки по запросу Заказчика`,
  free: `предоставление Заказчику и слушателям Заказчика доступа к образовательной платформе «СИНТАГМА» на безвозмездной основе в объёме, необходимом для подтверждения наличия у Заказчика цифровой образовательной среды при подготовке документов для лицензирования и внутренней организации обучения, с использованием базового функционала платформы: ${PLAN_CORE_FUNCTIONS}`,
};

/** @deprecated Используйте PLAN_CONTRACT_SUBJECTS.start */
export const START_PLAN_CONTRACT_SUBJECT = PLAN_CONTRACT_SUBJECTS.start;

export const ADMIN_DOC_META: Record<
  AdminDocType,
  { title: string; description: string; requiresAmount: boolean; allowsCompany: boolean }
> = {
  paid_contract: {
    title: "Договор возмездного оказания услуг",
    description: "Между ИП Шафрановский М.М. и организацией-заказчиком с указанием стоимости услуг.",
    requiresAmount: true,
    allowsCompany: true,
  },
  free_contract: {
    title: "Договор безвозмездного оказания услуг",
    description: "Для лицензирующих органов, партнёров и пилотных проектов без оплаты.",
    requiresAmount: false,
    allowsCompany: true,
  },
  pdn_consent: {
    title: "Согласие на обработку персональных данных",
    description: "Стандартное согласие физлица-слушателя по 152-ФЗ.",
    requiresAmount: false,
    allowsCompany: false,
  },
  mixed_package: {
    title: "Пакет: Согласие на маркетинг + ПЭП + Поручение на обработку ПДн",
    description: "Комбинированный документ по 152-ФЗ / 63-ФЗ для полного покрытия договорных отношений.",
    requiresAmount: false,
    allowsCompany: true,
  },
};

const commonStyles = `
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #000; margin: 0; }
  .doc { max-width: 780px; margin: 0 auto; padding: 24px 32px; }
  h1 { font-size: 16pt; text-align: center; margin: 8px 0 20px; }
  h2 { font-size: 13pt; margin-top: 18px; }
  p { text-align: justify; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
  .muted { color: #444; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td { vertical-align: top; padding: 6px 8px; }
  .parties td { width: 50%; border: 1px solid #333; }
  .signblock { margin-top: 32px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
  .signblock .party { flex: 1; }
  .stamp { width: 140px; height: 140px; object-fit: contain; mix-blend-mode: multiply; }
  .sign-img { height: 46px; object-fit: contain; }
  ol, ul { padding-left: 22px; }
  li { margin: 4px 0; text-align: justify; }
  @media print { .doc { padding: 12mm 15mm; } }
`;

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

function counterpartyBlock(v: AdminDocVariables): string {
  if (v.counterparty_kind === "individual") {
    return `
      <strong>${v.counterparty_name}</strong><br/>
      ${v.individual_passport ? `Паспорт: ${v.individual_passport}<br/>` : ""}
      ${v.individual_birthdate ? `Дата рождения: ${fmtDate(v.individual_birthdate)}<br/>` : ""}
      ${v.counterparty_address ? `Адрес: ${v.counterparty_address}<br/>` : ""}
      ${v.counterparty_email ? `Email: ${v.counterparty_email}<br/>` : ""}
      ${v.counterparty_phone ? `Тел.: ${v.counterparty_phone}` : ""}
    `;
  }
  const isIp = v.counterparty_kind === "ip";
  return `
    <strong>${isIp ? "ИП" : ""} ${v.counterparty_name}</strong><br/>
    ${v.counterparty_inn ? `ИНН: ${v.counterparty_inn}<br/>` : ""}
    ${v.counterparty_kpp ? `КПП: ${v.counterparty_kpp}<br/>` : ""}
    ${v.counterparty_ogrn ? `${isIp ? "ОГРНИП" : "ОГРН"}: ${v.counterparty_ogrn}<br/>` : ""}
    ${v.counterparty_address ? `Адрес: ${v.counterparty_address}<br/>` : ""}
    ${v.counterparty_signatory ? `В лице: ${v.counterparty_signatory_position || "Руководитель"} ${v.counterparty_signatory}<br/>` : ""}
    ${v.counterparty_email ? `Email: ${v.counterparty_email}<br/>` : ""}
    ${v.counterparty_phone ? `Тел.: ${v.counterparty_phone}` : ""}
  `;
}

function operatorBlock(): string {
  return `
    <strong>${OPERATOR.fullName}</strong><br/>
    ИНН: ${OPERATOR.inn}<br/>
    ОГРНИП: ${OPERATOR.ogrnip}<br/>
    Адрес: ${OPERATOR.address}<br/>
    Р/с: ${OPERATOR.bankAccount}<br/>
    Банк: ${OPERATOR.bankName}<br/>
    БИК: ${OPERATOR.bik} · К/с: ${OPERATOR.corrAccount}<br/>
    Email: ${OPERATOR.email} · Тел.: ${OPERATOR.phone}
  `;
}

function signBlock(v: AdminDocVariables, includeCounterpartySign = true): string {
  const stampAbs = new URL(stampImg, window.location.origin).href;
  const signAbs = new URL(signatureImg, window.location.origin).href;
  return `
    <div class="signblock">
      <div class="party">
        <div class="muted">Исполнитель</div>
        <div><strong>${OPERATOR.shortName}</strong></div>
        <div style="position:relative;margin-top:8px;">
          <img class="sign-img" src="${signAbs}" alt="Подпись" crossorigin="anonymous"/>
          <img class="stamp" src="${stampAbs}" alt="Печать" crossorigin="anonymous" style="position:absolute;left:60px;top:-40px;"/>
        </div>
        <div class="muted" style="margin-top:36px;border-top:1px solid #333;padding-top:2px;width:200px;">М.П. / подпись</div>
      </div>
      ${includeCounterpartySign ? `
      <div class="party">
        <div class="muted">Заказчик</div>
        <div><strong>${v.counterparty_signatory || v.counterparty_name}</strong></div>
        <div style="margin-top:56px;border-top:1px solid #333;padding-top:2px;width:200px;" class="muted">М.П. / подпись</div>
      </div>` : ""}
    </div>
  `;
}

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>${title}</title><style>${commonStyles}</style></head><body><div class="doc">${body}</div></body></html>`;
}

function paidContract(v: AdminDocVariables): string {
  const subject = v.subject || START_PLAN_CONTRACT_SUBJECT;
  const body = `
    <div class="row"><div>Договор № <strong>${v.doc_number || "____"}</strong></div><div>${fmtDate(v.doc_date)}</div></div>
    <h1>ДОГОВОР ВОЗМЕЗДНОГО ОКАЗАНИЯ УСЛУГ</h1>
    <p>${OPERATOR.fullName}, ИНН ${OPERATOR.inn}, именуемый в дальнейшем «Исполнитель», с одной стороны, и
    <strong>${v.counterparty_name}</strong>${v.counterparty_inn ? `, ИНН ${v.counterparty_inn}` : ""}, в лице ${v.counterparty_signatory_position || "руководителя"} ${v.counterparty_signatory || "___"},
    именуем${v.counterparty_kind === "individual" ? "ый" : "ое"} в дальнейшем «Заказчик», с другой стороны, заключили настоящий Договор о нижеследующем:</p>
    <h2>1. Предмет договора</h2>
    <p>1.1. Исполнитель обязуется оказать Заказчику услуги: <strong>${subject}</strong>, а Заказчик обязуется принять и оплатить такие услуги в порядке, установленном настоящим Договором.</p>
    <p>1.2. Доступ предоставляется дистанционно через сеть Интернет. Заказчик самостоятельно определяет перечень слушателей, которым предоставляется доступ, и несёт ответственность за корректность переданных Исполнителю данных слушателей.</p>
    <p>1.3. Исполнитель обеспечивает работоспособность платформы, хранение размещённых в пределах тарифа материалов, предоставление цифровой библиотеки, инструментов видеоидентификации, отчётности и иных функций тарифа «Старт», если иное не согласовано сторонами письменно.</p>
    <h2>2. Стоимость и порядок расчётов</h2>
    <p>2.1. Стоимость услуг составляет <strong>${v.amount || "___"}</strong> руб., НДС не облагается (применяется УСН/НПД).</p>
    <p>2.2. Оплата производится по счёту Исполнителя в течение 5 (пяти) банковских дней с даты подписания Договора.</p>
    <h2>3. Срок оказания услуг</h2>
    <p>3.1. Срок: ${v.term || "с момента оплаты до полного исполнения обязательств"}.</p>
    <h2>4. Реквизиты сторон</h2>
    <table class="parties"><tr>
      <td><div class="muted">Исполнитель</div>${operatorBlock()}</td>
      <td><div class="muted">Заказчик</div>${counterpartyBlock(v)}</td>
    </tr></table>
    ${signBlock(v)}
  `;
  return shell("Договор возмездного оказания услуг", body);
}

function freeContract(v: AdminDocVariables): string {
  const subject = v.subject || START_PLAN_CONTRACT_SUBJECT;
  const body = `
    <div class="row"><div>Договор № <strong>${v.doc_number || "____"}</strong></div><div>${fmtDate(v.doc_date)}</div></div>
    <h1>ДОГОВОР БЕЗВОЗМЕЗДНОГО ОКАЗАНИЯ УСЛУГ</h1>
    <p>${OPERATOR.fullName}, ИНН ${OPERATOR.inn}, именуемый «Исполнитель», и
    <strong>${v.counterparty_name}</strong>${v.counterparty_inn ? `, ИНН ${v.counterparty_inn}` : ""}, именуем${v.counterparty_kind === "individual" ? "ый" : "ое"} «Заказчик», заключили настоящий Договор:</p>
    <h2>1. Предмет договора</h2>
    <p>1.1. Исполнитель обязуется оказать Заказчику услуги <strong>на безвозмездной основе</strong>: ${subject}.</p>
    <p>1.2. Доступ предоставляется Заказчику и слушателям Заказчика дистанционно через сеть Интернет. Исполнитель предоставляет функционал платформы для организации обучения, хранения учебных материалов, ведения цифровой библиотеки, видеоидентификации, контроля прогресса, тестирования, отчётности, подготовки данных для ФИС ФРДО и сервисного взаимодействия со слушателями.</p>
    <p>1.3. Договор заключён в целях, не связанных с извлечением прибыли (ст. 423 ГК РФ), в том числе для подтверждения наличия у Заказчика доступа к цифровой образовательной среде и функционалу платформы при подготовке документов для лицензирования и внутренней организации обучения.</p>
    <h2>2. Срок</h2>
    <p>2.1. ${v.term || "Договор действует с даты подписания до 31 декабря текущего года и продлевается автоматически, если ни одна из сторон не заявит о его прекращении."}</p>
    <h2>3. Ответственность и порядок изменения</h2>
    <p>3.1. Стороны несут ответственность в соответствии с действующим законодательством РФ.</p>
    <p>3.2. Все изменения оформляются письменными дополнительными соглашениями.</p>
    <h2>4. Реквизиты сторон</h2>
    <table class="parties"><tr>
      <td><div class="muted">Исполнитель</div>${operatorBlock()}</td>
      <td><div class="muted">Заказчик</div>${counterpartyBlock(v)}</td>
    </tr></table>
    ${signBlock(v)}
  `;
  return shell("Договор безвозмездного оказания услуг", body);
}

function pdnConsent(v: AdminDocVariables): string {
  const body = `
    <h1>СОГЛАСИЕ<br/>на обработку персональных данных</h1>
    <div class="row"><div>${v.counterparty_address || "г. ______"}</div><div>${fmtDate(v.doc_date)}</div></div>
    <p>Я, <strong>${v.counterparty_name}</strong>,
    ${v.individual_passport ? `паспорт ${v.individual_passport},` : ""}
    ${v.individual_birthdate ? `дата рождения ${fmtDate(v.individual_birthdate)},` : ""}
    ${v.counterparty_address ? `зарегистрирован(а) по адресу ${v.counterparty_address},` : ""}
    в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» свободно, своей волей и в своём интересе даю согласие Оператору —
    ${OPERATOR.fullName}, ИНН ${OPERATOR.inn}, адрес: ${OPERATOR.address}, — на обработку моих персональных данных.</p>

    <h2>1. Перечень персональных данных</h2>
    <p>Фамилия, имя, отчество; дата и место рождения; данные документа, удостоверяющего личность; СНИЛС; ИНН; адрес регистрации и фактического проживания; контактные телефон и email; сведения об образовании; фотография; сведения о прохождении обучения и результатах аттестации.</p>

    <h2>2. Цели обработки</h2>
    <p>${v.purposes || "Оказание образовательных услуг, выдача документов об образовании, формирование отчётности во ФИС ФРДО, ведение договорной и бухгалтерской документации, направление информационных и организационных сообщений."}</p>

    <h2>3. Перечень действий</h2>
    <p>Сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передача (предоставление, доступ), обезличивание, блокирование, удаление, уничтожение — как автоматизированная, так и без использования средств автоматизации.</p>

    <h2>4. Срок действия согласия</h2>
    <p>${v.duration || "Согласие действует с даты подписания до истечения сроков хранения соответствующих сведений, установленных законодательством РФ, либо до момента отзыва в письменной форме."}</p>

    <h2>5. Порядок отзыва</h2>
    <p>Согласие может быть отозвано путём направления письменного заявления по адресу Оператора или на email ${OPERATOR.email}.</p>

    <div class="signblock">
      <div class="party">
        <div class="muted">Субъект персональных данных</div>
        <div style="margin-top:56px;border-top:1px solid #333;padding-top:2px;width:280px;">${v.counterparty_name} / подпись</div>
      </div>
      <div class="party">
        <div class="muted">Принято Оператором</div>
        <div><strong>${OPERATOR.shortName}</strong></div>
      </div>
    </div>
    ${signBlock(v, false)}
  `;
  return shell("Согласие на обработку персональных данных", body);
}

function mixedPackage(v: AdminDocVariables): string {
  const body = `
    <h1>КОМПЛЕКСНЫЙ ДОКУМЕНТ<br/><span style="font-size:12pt;font-weight:normal;">Соглашение об ЭП (ПЭП) · Согласие на маркетинговые рассылки · Поручение на обработку ПДн</span></h1>
    <div class="row"><div>Оператор: ${OPERATOR.shortName}</div><div>${fmtDate(v.doc_date)}</div></div>

    <h2>Часть I. Соглашение об использовании простой электронной подписи</h2>
    <p>Стороны признают, что документы и волеизъявления, подписанные простой электронной подписью (ПЭП) в личном кабинете платформы Синтагма (sintagma.com.ru), имеют юридическую силу, равную документам на бумажном носителе, подписанным собственноручно (ст. 6 63-ФЗ). Ключом ПЭП является логин/email в связке с паролем и/или одноразовым кодом.</p>

    <h2>Часть II. Согласие на получение маркетинговых сообщений</h2>
    <p>${v.counterparty_name}${v.counterparty_email ? ` (${v.counterparty_email})` : ""} даёт согласие ${OPERATOR.fullName} на направление информационных и рекламных сообщений по email, SMS и push-уведомлениям в соответствии с ФЗ «О рекламе». Согласие может быть отозвано в любой момент по ссылке в письме или письмом на ${OPERATOR.email}.</p>

    <h2>Часть III. Поручение на обработку персональных данных (DPA)</h2>
    <p>${v.counterparty_name} (Заказчик, Оператор ПДн) поручает ${OPERATOR.fullName} (Исполнителю, Обработчику) обработку персональных данных обучающихся Заказчика в целях: ${v.purposes || "предоставление доступа к образовательной платформе, ведение учёта прогресса, выдача документов об образовании, формирование отчётности во ФИС ФРДО"}.</p>
    <p>Обработчик обязуется:</p>
    <ol>
      <li>обрабатывать данные исключительно в объёме и целях, указанных Заказчиком;</li>
      <li>обеспечить конфиденциальность и применить организационные и технические меры защиты (152-ФЗ, ПП РФ № 1119);</li>
      <li>не привлекать субподрядчиков без письменного согласия Заказчика;</li>
      <li>по требованию удалить или вернуть данные в течение 30 дней;</li>
      <li>уведомить Заказчика об инцидентах в течение 24 часов.</li>
    </ol>
    <p>Срок действия — до расторжения основного договора или письменного отзыва одной из сторон.</p>

    <h2>Реквизиты сторон</h2>
    <table class="parties"><tr>
      <td><div class="muted">Оператор / Обработчик</div>${operatorBlock()}</td>
      <td><div class="muted">Заказчик / Оператор ПДн</div>${counterpartyBlock(v)}</td>
    </tr></table>
    ${signBlock(v)}
  `;
  return shell("Комплексный документ (ПЭП + Маркетинг + DPA)", body);
}

export function renderAdminDoc(type: AdminDocType, v: AdminDocVariables): string {
  switch (type) {
    case "paid_contract": return paidContract(v);
    case "free_contract": return freeContract(v);
    case "pdn_consent": return pdnConsent(v);
    case "mixed_package": return mixedPackage(v);
  }
}
