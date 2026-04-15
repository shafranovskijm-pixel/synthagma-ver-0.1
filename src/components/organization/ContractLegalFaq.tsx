import { Info, FileCheck, FileText, Wrench, ScrollText } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function ContractLegalFaq() {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm text-destructive mb-1">Важно: договор без обязательных пунктов считается незаключённым</h4>
            <p className="text-xs text-muted-foreground">
              Согласно ст. 54 Федерального закона от 29.12.2012 № 273-ФЗ и п. 13 Правил № 1441, отсутствие хотя бы одного существенного условия делает договор незаключённым. Используйте шаблон «273-ФЗ (полный)» для полного соответствия.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-1">Запрет ухудшения положения обучающихся</h4>
            <p className="text-xs text-muted-foreground">
              Условия, ограничивающие права обучающихся по сравнению с законодательством об образовании, автоматически признаются недействительными (п. 6 ст. 54 273-ФЗ).
            </p>
          </div>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        <AccordionItem value="required" className="border border-border rounded-xl px-4">
          <AccordionTrigger className="text-sm hover:no-underline">
            <span className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-primary" />
              Обязательные пункты договора (п. 13 Правил № 1441)
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1.5 text-xs">
              {[
                "Полное наименование и фирменное наименование Исполнителя",
                "Место нахождения или место жительства Исполнителя",
                "Наименование / ФИО Заказчика, телефон",
                "Место нахождения или место жительства Заказчика",
                "ФИО и реквизиты документа представителя Исполнителя/Заказчика",
                "ФИО, место жительства, телефон обучающегося (если не Заказчик)",
                "Права, обязанности и ответственность всех сторон",
                "Полная стоимость + порядок оплаты",
                "Сведения о лицензии (орган, номер, дата)",
                "Вид, уровень и направленность программы",
                "Форма обучения",
                "Сроки освоения программы (продолжительность)",
                "Вид выдаваемого документа об образовании",
                "Порядок изменения и расторжения договора",
                "Другие сведения по специфике (доступ к СДО, требования к оборудованию)",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                  <span className="font-mono text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 shrink-0">{i + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="templates" className="border border-border rounded-xl px-4">
          <AccordionTrigger className="text-sm hover:no-underline">
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Какой шаблон выбрать?
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                <div className="font-semibold text-primary mb-1">273-ФЗ (полный) — рекомендуемый</div>
                <p className="text-muted-foreground">Содержит все 15 обязательных пунктов п. 13 Правил № 1441. Включает разделы: предмет, стоимость, права/обязанности, ответственность, особые условия СДО, порядок расторжения, реквизиты. Подходит для юрлиц.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold mb-1">Для юр. лица — упрощённый</div>
                <p className="text-muted-foreground">Базовый шаблон без расширенных разделов. Требует ручного добавления обязательных пунктов (лицензия, форма обучения, вид документа и др.).</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold mb-1">Для физ. лица</div>
                <p className="text-muted-foreground">Договор с физическим лицом. Заказчик и обучающийся — одно лицо.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold mb-1">Для ИП (исполнитель)</div>
                <p className="text-muted-foreground">Когда ваша организация — ИП (ОГРНИП вместо ОГРН, без КПП).</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="placeholders" className="border border-border rounded-xl px-4">
          <AccordionTrigger className="text-sm hover:no-underline">
            <span className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" />
              Как работает автоподстановка переменных?
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <p>В шаблоне используются переменные в формате <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-mono text-[11px]">{"{{переменная}}"}</code>. При формировании договора они автоматически заменяются на реальные данные из реквизитов вашей организации и данных заказчика.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: "{{org_name}}", desc: "Название организации" },
                  { key: "{{org_inn}}", desc: "ИНН организации" },
                  { key: "{{org_license_number}}", desc: "Номер лицензии" },
                  { key: "{{org_license_date}}", desc: "Дата лицензии" },
                  { key: "{{org_license_issuer}}", desc: "Кем выдана лицензия" },
                  { key: "{{education_form}}", desc: "Форма обучения" },
                  { key: "{{document_type_name}}", desc: "Вид документа" },
                  { key: "{{course_title}}", desc: "Название курса" },
                ].map((v) => (
                  <div key={v.key} className="flex items-center gap-2 p-1.5 rounded bg-muted/50">
                    <code className="text-[10px] font-mono text-primary shrink-0">{v.key}</code>
                    <span className="text-[11px]">— {v.desc}</span>
                  </div>
                ))}
              </div>
              <p>Полный список переменных доступен в конструкторе договора через ПКМ (правый клик) по тексту.</p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="laws" className="border border-border rounded-xl px-4">
          <AccordionTrigger className="text-sm hover:no-underline">
            <span className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-primary" />
              Ссылки на нормативные акты
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold mb-1">Федеральный закон от 29.12.2012 № 273-ФЗ</div>
                <p className="text-muted-foreground">«Об образовании в Российской Федерации», статья 54 — «Договор об образовании»</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold mb-1">Постановление Правительства РФ от 15.09.2020 № 1441</div>
                <p className="text-muted-foreground">«Об утверждении Правил оказания платных образовательных услуг» (действует до 31.12.2026)</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold mb-1">Закон РФ от 07.02.1992 № 2300-1</div>
                <p className="text-muted-foreground">«О защите прав потребителей» — применяется к договорам с физическими лицами</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
