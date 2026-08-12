interface ProgramReplyTemplateInput {
  remoteName?: string | null;
  interestHours?: number | null;
}
const PROGRAMS = [
  { hours: 50, price: "17 300 ₽", loyaltyPrice: "15 500 ₽", audience: "для руководителей заказчиков, не входящих в комиссию" },
  { hours: 150, price: "31 000 ₽", loyaltyPrice: "27 900 ₽", audience: "для контрактных управляющих, сотрудников, госслужащих, руководителей и членов комиссий" },
  { hours: 250, price: "43 900 ₽", loyaltyPrice: "39 500 ₽", audience: "профессиональная переподготовка для контрактных управляющих и сотрудников контрактной службы" },
  { hours: 500, price: "63 200 ₽", loyaltyPrice: "56 900 ₽", audience: "профессиональная переподготовка для государственных и муниципальных служащих" },
  { hours: 1000, price: "99 300 ₽", loyaltyPrice: "89 400 ₽", audience: "«Эксперт в сфере закупок»: 44-ФЗ, 223-ФЗ, контроль и отдельные виды закупок" },
] as const;

const normalizeDisplayName = (value?: string | null) => {
  const name = (value || "").replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim();
  return name.length > 1 && name.length <= 80 ? name : "";
};

export function buildProgramReplyTemplate({ remoteName, interestHours }: ProgramReplyTemplateInput) {
  const name = normalizeDisplayName(remoteName);
  const greeting = name ? `${name}, добрый день.` : "Добрый день.";
  const selected = PROGRAMS.find((program) => program.hours === interestHours);
  const selectedLine = selected
    ? `Вы указали программу ${selected.hours} часов: ${selected.price} за участника, для постоянных клиентов — ${selected.loyaltyPrice}.\n\n`
    : "";
  const priceLines = PROGRAMS
    .map((program) => `• ${program.hours} часов — ${program.price}; для постоянных клиентов ${program.loyaltyPrice} (${program.audience}).`)
    .join("\n");

  return `${greeting}

Спасибо за интерес к курсу «Контрактная система 2026. Работающие инструменты».

Ближайшая группа: 17–21 августа, ВКС, ежедневно 09:00–18:00. За пять дней разберём № 279-ФЗ и № 330-ФЗ, новые правила НМЦК топлива, закупки малого объёма, национальный режим, электронные процедуры, исполнение и изменение контрактов. Участник получит рабочую карту изменений по датам, шаблоны, памятки, алгоритмы и годовую поддержку по консультационным вопросам.

${selectedLine}Варианты программы и стоимость за одного участника:
${priceLines}

Для трёх и более участников предусмотрена дополнительная скидка 15%; условия суммирования уточним при расчёте.

Чтобы подготовить точный расчёт, счёт, договор и заявку, пришлите, пожалуйста:
• название организации;
• ФИО и должность участника;
• выбранную программу (50 / 150 / 250 / 500 / 1000 часов);
• количество участников.

С уважением,
Екатерина
Институт «Развитие 2000»
Лицензия № 98 от 07.04.2017`;
}
