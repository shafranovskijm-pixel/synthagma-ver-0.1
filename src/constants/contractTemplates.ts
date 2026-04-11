export interface ContractCustomService {
  name: string;
  price: number;
}

export interface ContractData {
  contractNumber: string;
  contractDate: string;
  companyName: string;
  companyInn: string;
  companyKpp: string;
  companyAddress: string;
  companyDirector: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  tariffPlan: string;
  durationMonths: number;
  totalAmount: number;
  prepaymentAmount: number;
  customServices: ContractCustomService[];
  notes: string;
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatDate(d: string) {
  if (!d) return '___________';
  const date = new Date(d);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function generateSintagmaContract(data: ContractData): string {
  const customServicesRows = data.customServices.length > 0
    ? data.customServices.map((s, i) => `<tr><td>${i + 1}</td><td>${s.name}</td><td>${formatMoney(s.price)} руб.</td></tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;">Доработки не предусмотрены</td></tr>';

  const customServicesTotal = data.customServices.reduce((sum, s) => sum + s.price, 0);

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><style>
  body { font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.6; color: #000; max-width: 210mm; margin: 0 auto; padding: 20mm; }
  h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 15px; margin-top: 24px; margin-bottom: 8px; }
  .center { text-align: center; }
  .header-info { text-align: center; margin-bottom: 24px; color: #555; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  table td, table th { border: 1px solid #333; padding: 6px 10px; font-size: 13px; }
  table th { background: #f0f0f0; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; gap: 40px; }
  .sig-block { width: 45%; }
  .sig-block h3 { font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 4px; }
  .sig-line { border-bottom: 1px solid #000; height: 30px; margin: 12px 0; }
  p { margin: 6px 0; text-align: justify; }
  @media print { body { padding: 10mm; } }
</style></head>
<body>

<h1>ДОГОВОР № ${data.contractNumber || '___'}</h1>
<p class="center">на предоставление доступа к платформе «Синтагма»<br>и оказание услуг по миграции и доработке</p>
<div class="header-info">г. Москва &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${formatDate(data.contractDate)}</div>

<p><strong>Индивидуальный предприниматель Сидоренко Антон Андреевич</strong>, действующий на основании свидетельства о государственной регистрации, именуемый в дальнейшем «Исполнитель», с одной стороны, и</p>

<p><strong>${data.companyName || '_______________'}</strong>, ИНН ${data.companyInn || '___________'}, КПП ${data.companyKpp || '___________'}, в лице ${data.companyDirector || '_______________'}, действующего на основании Устава, именуемый в дальнейшем «Заказчик», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:</p>

<h2>1. ПРЕДМЕТ ДОГОВОРА</h2>
<p>1.1. Исполнитель обязуется предоставить Заказчику доступ к облачной платформе «Синтагма» (далее — Платформа) для организации дистанционного обучения, а также оказать услуги по миграции данных из системы SkillSpace и доработке функционала Платформы в соответствии с условиями настоящего Договора.</p>
<p>1.2. Тарифный план: <strong>${data.tariffPlan || 'Стандартный'}</strong>.</p>
<p>1.3. Срок действия доступа к Платформе: <strong>${data.durationMonths} (${data.durationMonths === 12 ? 'двенадцать' : data.durationMonths}) месяцев</strong> с момента предоставления доступа.</p>

<h2>2. ОБЯЗАННОСТИ ИСПОЛНИТЕЛЯ</h2>
<p>2.1. Предоставить Заказчику доступ к Платформе в течение 3 (трёх) рабочих дней после получения предоплаты.</p>
<p>2.2. Осуществить полную миграцию данных из системы SkillSpace в Платформу, включая:</p>
<p style="padding-left:20px;">а) перенос курсов, уроков, тестов и учебных материалов;<br>
б) перенос данных учеников (профили, прогресс обучения, результаты тестов);<br>
в) перенос структуры организации (компании, группы);<br>
г) перенос документов и шаблонов.</p>
<p>2.3. Срок миграции: не более <strong>14 (четырнадцати) рабочих дней</strong> с момента предоставления Заказчиком доступа к данным SkillSpace.</p>
<p>2.4. Выполнить доработку функционала Платформы согласно Приложению к настоящему Договору (п. 5).</p>
<p>2.5. Обеспечить техническую поддержку Платформы в рабочие дни с 9:00 до 18:00 (МСК).</p>
<p>2.6. Гарантировать сохранность и конфиденциальность данных Заказчика.</p>

<h2>3. ОБЯЗАННОСТИ ЗАКАЗЧИКА</h2>
<p>3.1. Предоставить Исполнителю доступ к аккаунту SkillSpace для осуществления миграции данных.</p>
<p>3.2. Предоставить необходимые данные и материалы для доработки функционала.</p>
<p>3.3. Обеспечить своевременную оплату услуг в соответствии с п. 4 настоящего Договора.</p>
<p>3.4. Назначить контактное лицо для оперативного взаимодействия: <strong>${data.contactPerson || '_______________'}</strong>, тел.: ${data.contactPhone || '___________'}, email: ${data.contactEmail || '___________'}.</p>

<h2>4. СТОИМОСТЬ И ПОРЯДОК ОПЛАТЫ</h2>
<p>4.1. Общая стоимость услуг по настоящему Договору составляет <strong>${formatMoney(data.totalAmount)} (${numberToWords(data.totalAmount)}) рублей</strong>, в том числе:</p>
<p style="padding-left:20px;">а) Доступ к Платформе (тариф «${data.tariffPlan || 'Стандартный'}», ${data.durationMonths} мес.): ${formatMoney(data.totalAmount - customServicesTotal)} руб.<br>
б) Доработка функций: ${formatMoney(customServicesTotal)} руб.</p>
<p>4.2. Предоплата в размере <strong>${formatMoney(data.prepaymentAmount)} руб. (${Math.round(data.prepaymentAmount / data.totalAmount * 100)}%)</strong> вносится в течение 5 (пяти) банковских дней с момента подписания Договора.</p>
<p>4.3. Оставшаяся сумма в размере ${formatMoney(data.totalAmount - data.prepaymentAmount)} руб. оплачивается в течение 10 (десяти) банковских дней после завершения миграции и подписания Акта приёма-передачи.</p>
<p>4.4. Исполнитель не является плательщиком НДС (УСН).</p>

<h2>5. ПЕРЕЧЕНЬ ДОРАБОТОК</h2>
<table>
  <tr><th>№</th><th>Наименование доработки</th><th>Стоимость</th></tr>
  ${customServicesRows}
  <tr><td colspan="2" style="text-align:right;"><strong>Итого доработки:</strong></td><td><strong>${formatMoney(customServicesTotal)} руб.</strong></td></tr>
</table>
<p>5.1. Сроки выполнения доработок согласовываются Сторонами отдельно. Ориентировочный срок выполнения каждой доработки — до 10 рабочих дней.</p>

<h2>6. СРОКИ И ПОРЯДОК СДАЧИ-ПРИЁМКИ</h2>
<p>6.1. По завершении миграции данных Исполнитель уведомляет Заказчика и предоставляет Акт приёма-передачи.</p>
<p>6.2. Заказчик обязан в течение 5 (пяти) рабочих дней проверить результат и подписать Акт, либо направить мотивированный отказ.</p>
<p>6.3. При отсутствии замечаний в указанный срок работы считаются принятыми.</p>

<h2>7. ГАРАНТИИ И ОТВЕТСТВЕННОСТЬ</h2>
<p>7.1. Исполнитель гарантирует работоспособность Платформы с доступностью не менее 99,5% времени в месяц (исключая плановое обслуживание).</p>
<p>7.2. Исполнитель обязуется устранять ошибки Платформы в разумные сроки.</p>
<p>7.3. Ответственность каждой из Сторон ограничена общей суммой настоящего Договора.</p>

<h2>8. КОНФИДЕНЦИАЛЬНОСТЬ</h2>
<p>8.1. Стороны обязуются не разглашать конфиденциальную информацию, полученную в ходе исполнения настоящего Договора.</p>
<p>8.2. Исполнитель обязуется обрабатывать персональные данные в соответствии с ФЗ-152 «О персональных данных».</p>

<h2>9. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ</h2>
<p>9.1. Все споры разрешаются путём переговоров. При недостижении согласия спор передаётся в суд по месту нахождения Исполнителя.</p>

<h2>10. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ</h2>
<p>10.1. Настоящий Договор вступает в силу с момента подписания и действует до полного исполнения обязательств Сторонами.</p>
<p>10.2. Договор составлен в двух экземплярах, имеющих равную юридическую силу.</p>
<p>10.3. Все изменения и дополнения действительны в письменной форме, подписанной обеими Сторонами.</p>

<div class="signatures">
  <div class="sig-block">
    <h3>ИСПОЛНИТЕЛЬ</h3>
    <p>ИП Сидоренко Антон Андреевич</p>
    <p>ИНН: ___________</p>
    <p>ОГРНИП: ___________</p>
    <p>Р/с: ___________</p>
    <p>Банк: ___________</p>
    <p>БИК: ___________</p>
    <div class="sig-line"></div>
    <p>Подпись / М.П.</p>
  </div>
  <div class="sig-block">
    <h3>ЗАКАЗЧИК</h3>
    <p>${data.companyName || '_______________'}</p>
    <p>ИНН: ${data.companyInn || '___________'}</p>
    <p>КПП: ${data.companyKpp || '___________'}</p>
    <p>Адрес: ${data.companyAddress || '___________'}</p>
    <p>В лице: ${data.companyDirector || '___________'}</p>
    <div class="sig-line"></div>
    <p>Подпись / М.П.</p>
  </div>
</div>

</body></html>`;
}

function numberToWords(n: number): string {
  // Simplified Russian number-to-words for amounts
  const rounded = Math.round(n);
  return `${rounded}`;
}
