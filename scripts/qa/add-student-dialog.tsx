// Local component QA only: real controls, synthetic props, no backend imports.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AddStudentDialog, type AddStudentInput } from "../../src/components/organization/dialogs/AddStudentDialog";
import "../../src/index.css";

const courses = [
  { id: "qa-course-ot", title: "Охрана труда — учебный пример", is_published: true },
  { id: "qa-course-fire", title: "Пожарная безопасность — учебный пример", is_published: true },
  { id: "qa-course-draft", title: "Курс группы в черновике", is_published: false },
];
const groups = [
  { id: "qa-group-ot", name: "Тестовая группа с курсом", course_id: "qa-course-ot" },
  { id: "qa-group-empty", name: "Тестовая группа без курса", course_id: null },
  { id: "qa-group-draft", name: "Группа с курсом-черновиком", course_id: "qa-course-draft" },
];

function Harness() {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState("normal");
  const [warning, setWarning] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<AddStudentInput[]>([]);
  const start = (next: string) => { setScenario(next); setWarning(null); setOpen(true); };
  return <main className="p-8 space-y-6">
    <h1 className="text-2xl font-semibold">Локальная проверка формы организации</h1>
    <p>Только синтетические данные. Ученик в базе НЕ создаётся. Проверяется настоящий компонент и его исходящий ввод, не серверное зачисление.</p>
    <div className="flex gap-4 flex-wrap">
      <button className="border rounded p-3" onClick={() => start("normal")}>Обычная форма</button>
      <button className="border rounded p-3" onClick={() => start("error")}>Ошибка справочника групп</button>
      <button className="border rounded p-3" onClick={() => start("loading")}>Загрузка справочника групп</button>
      <button className="border rounded p-3" onClick={() => start("uncertain")}>Неопределённый ответ</button>
      <button className="border rounded p-3" onClick={() => setOpen(true)}>Открыть сохранённую форму</button>
    </div>
    <section aria-label="Результат проверки"><h2>Отправок: {submissions.length}</h2><pre className="whitespace-pre-wrap">{JSON.stringify(submissions, null, 2)}</pre></section>
    <AddStudentDialog open={open} onOpenChange={setOpen} courses={courses}
      companies={[{ id: "qa-company", name: "Тестовая компания", inn: null }]}
      groups={scenario === "error" ? [] : groups} groupsError={scenario === "error"} groupsLoading={scenario === "loading"}
      isCreating={false} creationWarning={warning}
      onSubmit={(input) => {
        setSubmissions(previous => [...previous, input]);
        if (scenario === "uncertain") setWarning("Результат создания ученика не подтверждён. Проверьте список перед повтором.");
        else setOpen(false);
      }} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
