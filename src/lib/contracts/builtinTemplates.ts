/**
 * Встроенные шаблоны договоров (по одному на сценарий).
 * Используются, когда у организации ещё нет своих шаблонов:
 * менеджер может сгенерировать документ сразу, без загрузки DOCX.
 * ID начинаются с BUILTIN_TEMPLATE_PREFIX — такие шаблоны не имеют строки в БД,
 * поэтому при сохранении договора template_id пишется как null.
 */
export const BUILTIN_TEMPLATE_PREFIX = "builtin:";

export function isBuiltinTemplateId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(BUILTIN_TEMPLATE_PREFIX);
}

export interface BuiltinContractTemplate {
  id: string;
  name: string;
  body_html: string;
  is_default: boolean;
  counterparty_type: "individual" | "legal";
  version: number | null;
  updated_at: string | null;
  builtin: true;
}

const STYLE = `
<style>
  .doc { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.45; }
  .doc h1 { font-size: 14pt; text-align: center; margin-bottom: 4mm; }
  .doc h2 { font-size: 12pt; margin: 5mm 0 2mm; }
  .doc table { width: 100%; border-collapse: collapse; }
  .doc table.req td { vertical-align: top; width: 50%; padding: 2mm 3mm; }
  .doc .row { display: flex; justify-content: space-between; }
</style>`;

const signBlock = (customerBlock: string, signer: string) => `
<h2>Реквизиты и подписи сторон</h2>
<table class="req">
  <tr>
    <td>
      <b>Исполнитель</b><br/>
      {{org_name}}<br/>
      ИНН {{org_inn}} / КПП {{org_kpp}}<br/>
      ОГРН {{org_ogrn}}<br/>
      Адрес: {{org_address}}<br/>
      Банк: {{org_bank_name}}<br/>
      Р/с {{org_bank_account}}, БИК {{org_bank_bik}}<br/>
      Тел.: {{org_phone}}, e-mail: {{org_email}}<br/><br/>
      {{org_director_position}} _______________ / {{org_director_name}} /
    </td>
    <td>
      <b>Заказчик</b><br/>
      ${customerBlock}<br/><br/>
      _______________ / ${signer} /
    </td>
  </tr>
</table>`;

const COMMON_BODY = `
<h2>1. Предмет договора</h2>
<p>1.1. Исполнитель обязуется оказать образовательные услуги по программе
«{{program_title}}» в объёме {{program_hours}} академических часов, форма обучения — {{program_form}}.</p>
<p>1.2. Обучение проводится с использованием дистанционных образовательных технологий:
доступ слушателей к образовательной платформе Исполнителя предоставляется круглосуточно (24/7)
на весь период обучения.</p>
<p>1.3. По итогам успешного освоения программы и прохождения итоговой аттестации
слушателям выдаются документы об обучении установленного Исполнителем образца,
сведения передаются в ФИС ФРДО в соответствии с законодательством РФ.</p>

<h2>2. Стоимость и порядок расчётов</h2>
<p>2.1. Стоимость услуг по настоящему договору составляет {{total_price}} руб. ({{total_price_words}}), НДС не облагается.</p>
<p>2.2. Оплата производится в течение 5 (пяти) рабочих дней с даты подписания договора,
если сторонами не согласован иной порядок.</p>

<h2>3. Права и обязанности сторон</h2>
<p>3.1. Исполнитель обязуется обеспечить доступ к учебным материалам, консультационную
поддержку и проведение итоговой аттестации.</p>
<p>3.2. Заказчик обязуется обеспечить своевременную оплату, предоставить достоверные
персональные данные слушателей и соблюдать правила пользования платформой.</p>

<h2>4. Срок действия и прочие условия</h2>
<p>4.1. Договор вступает в силу с момента подписания и действует до полного исполнения обязательств.</p>
<p>4.2. Стороны признают юридическую силу документов, подписанных простой электронной подписью
в соответствии с Федеральным законом № 63-ФЗ.</p>
<p>4.3. Все споры разрешаются путём переговоров, а при недостижении согласия — в судебном порядке.</p>
`;

export const BUILTIN_CONTRACT_TEMPLATES: BuiltinContractTemplate[] = [
  {
    id: `${BUILTIN_TEMPLATE_PREFIX}individual`,
    name: "Базовый договор с физическим лицом (встроенный)",
    counterparty_type: "individual",
    is_default: false,
    version: 1,
    updated_at: null,
    builtin: true,
    body_html: `${STYLE}<div class="doc">
<h1>Договор об оказании образовательных услуг № {{contract_number}}</h1>
<p class="row"><span>{{org_address}}</span><span>{{contract_date}}</span></p>
<p>{{org_name}}, ИНН {{org_inn}}, в лице {{org_director_position}} {{org_director_name}},
действующего на основании Устава, именуемое далее «Исполнитель», с одной стороны, и
{{individual_name}}, паспорт {{individual_passport}}, адрес: {{individual_address}},
телефон {{individual_phone}}, e-mail {{individual_email}}, именуемый далее «Заказчик»
(он же «Слушатель»), с другой стороны, заключили настоящий договор о нижеследующем.</p>
${COMMON_BODY}
${signBlock('{{individual_name}}<br/>Паспорт: {{individual_passport}}<br/>Адрес: {{individual_address}}<br/>Тел.: {{individual_phone}}<br/>E-mail: {{individual_email}}', '{{individual_name}}')}
</div>`,
  },
  {
    id: `${BUILTIN_TEMPLATE_PREFIX}legal`,
    name: "Базовый договор с организацией-заказчиком (встроенный)",
    counterparty_type: "legal",
    is_default: false,
    version: 1,
    updated_at: null,
    builtin: true,
    body_html: `${STYLE}<div class="doc">
<h1>Договор об оказании образовательных услуг № {{contract_number}}</h1>
<p class="row"><span>{{org_address}}</span><span>{{contract_date}}</span></p>
<p>{{org_name}}, ИНН {{org_inn}}, в лице {{org_director_position}} {{org_director_name}},
действующего на основании Устава, именуемое далее «Исполнитель», с одной стороны, и
{{company_name}}, ИНН {{company_inn}}, КПП {{company_kpp}}, ОГРН {{company_ogrn}},
адрес: {{company_address}}, в лице {{company_director}}, именуемое далее «Заказчик»,
с другой стороны, заключили настоящий договор о нижеследующем.</p>
${COMMON_BODY}
<h2>5. Список слушателей</h2>
{{students_table}}
${signBlock('{{company_name}}<br/>ИНН {{company_inn}} / КПП {{company_kpp}}<br/>ОГРН {{company_ogrn}}<br/>Адрес: {{company_address}}', '{{company_director}}')}
</div>`,
  },
];

/** Встроенный шаблон под сценарий. */
export function builtinTemplateFor(scenario: "individual" | "legal"): BuiltinContractTemplate {
  return BUILTIN_CONTRACT_TEMPLATES.find(t => t.counterparty_type === scenario)!;
}
