import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useCourseMaterialPassport } from "@/hooks/useCourseMaterialPassport";

export function CourseMaterialPassportCard({ courseId, context, actorId }: { courseId: string; context: object; actorId?: string }) {
  const { visible, status, passport } = useCourseMaterialPassport(courseId, context, actorId);
  // A frozen source ID is insufficient: current ownership must also be confirmed.
  if (!visible) return null;
  const ready = passport && status === "verified" ? passport.sourceDeclared : null;
  return <Card>
    <CardHeader><CardTitle className="text-base">Паспорт по материалам курса</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">Сведения из учебного материала. Не являются утверждением образовательной программы организации.</p>
      {status === "loading" && <p role="status" className="text-sm text-muted-foreground">Проверка источника…</p>}
      {!ready && status !== "loading" && <p role="status" className="text-sm text-muted-foreground">Сведения не подтверждены: источник недоступен, изменён или паспорт по материалу ещё не подготовлен. Условия уточняются у учебного центра.</p>}
      {ready && passport && <>
        <Badge variant="outline">Материал источника сверён</Badge>
        <p className="font-medium">{ready.fullTitle}</p>
        <p className="text-sm text-muted-foreground">Заявлено в материале: {ready.programmeType === "qualification_upgrade" ? "повышение квалификации" : "профессиональная переподготовка"} · {ready.academicHours} академических часов · редакция {passport.source.sourceEdition}</p>
        <Accordion type="multiple">
          <AccordionItem value="purpose"><AccordionTrigger>Цель, аудитория и входные требования</AccordionTrigger><AccordionContent><div className="space-y-3">
            <p>{ready.purpose}</p><p><strong>Аудитория: </strong>{ready.audience}</p><p><strong>Входные требования: </strong>{ready.entryRequirements}</p>
          </div></AccordionContent></AccordionItem>
          <AccordionItem value="outcomes"><AccordionTrigger>Заявленные результаты</AccordionTrigger><AccordionContent><ul className="list-disc pl-5 space-y-1">{ready.outcomes.map((text, index) => <li key={index}>{text}</li>)}</ul></AccordionContent></AccordionItem>
          <AccordionItem value="plan"><AccordionTrigger>Авторский учебный план</AccordionTrigger><AccordionContent>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{ready.studyPlan.columns.map((text, index) => <th className="p-2 text-left border-b" key={index}>{text}</th>)}</tr></thead><tbody>{ready.studyPlan.rows.map((row, index) => <tr key={index}>{row.sourceCells.map((text, cell) => <td className="p-2 border-b" key={cell}>{text}</td>)}</tr>)}</tbody></table></div>
            <p className="mt-3 text-muted-foreground">Объём авторского плана не подтверждает фактически освоенные часы.</p>
          </AccordionContent></AccordionItem>
          <AccordionItem value="assessment"><AccordionTrigger>Оценивание и календарь</AccordionTrigger><AccordionContent><div className="space-y-3">
            <p>В авторском плане: {ready.authoredAssessment.format}, {ready.authoredAssessment.academicHours} академических часов.</p>
            {ready.authoredAssessment.conditions && <p>{ready.authoredAssessment.conditions}</p>}
            {ready.authoredAssessment.criteria && <p>{ready.authoredAssessment.criteria}</p>}
            {ready.authoredCalendar && <p>{ready.authoredCalendar.text}</p>}
            <p className="text-muted-foreground">Фактические настройки аттестации, её результаты, форма обучения и даты группы не подтверждены этим материалом. Их определяет учебный центр.</p>
          </div></AccordionContent></AccordionItem>
          <AccordionItem value="applicability"><AccordionTrigger>Заявленная применимость и источник</AccordionTrigger><AccordionContent><div className="space-y-3">
            <p>{ready.applicability}</p>
            <p className="text-muted-foreground">Это заявленные автором основания. Полная актуальная цепочка нормативных изменений здесь независимо не подтверждена.</p>
            <p className="text-xs text-muted-foreground break-all">Урок-источник: {passport.source.lessonId}<br />SHA-256: {passport.source.contentSha256}</p>
          </div></AccordionContent></AccordionItem>
        </Accordion>
      </>}
      <p className="text-sm text-muted-foreground">Выдаваемый документ, автор, права на материалы, методист и утверждение фактов: не подтверждены.</p>
    </CardContent>
  </Card>;
}
