import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { applyProposalVariables, type ProposalVariableContext } from "@/lib/proposalVariables";

interface CourseOption {
  id: string;
  title: string;
  duration: string | null;
  price: number | null;
  slug: string | null;
}

interface ServiceLine {
  custom_name: string;
  custom_description?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  course: CourseOption | null;
  companyName?: string | null;
  contactPerson?: string | null;
  introHtml?: string | null;
  outroHtml?: string | null;
  items?: ServiceLine[];
}

const VARIABLES = [
  { key: "course_name", label: "Название курса", source: "course" as const },
  { key: "course_duration", label: "Длительность", source: "course" as const },
  { key: "course_price", label: "Цена", source: "course" as const },
  { key: "course_url", label: "Публичная ссылка", source: "course" as const },
  { key: "company_name", label: "Название компании", source: "context" as const },
  { key: "contact_person", label: "Контактное лицо", source: "context" as const },
];

export function ProposalVariablesCheckDialog({
  open,
  onClose,
  course,
  companyName,
  contactPerson,
  introHtml,
  outroHtml,
  items = [],
}: Props) {
  const ctx: ProposalVariableContext = useMemo(() => ({
    course: course
      ? { title: course.title, duration: course.duration, price: course.price, slug: course.slug, id: course.id }
      : null,
    companyName: companyName || "",
    contactPerson: contactPerson || "",
  }), [course, companyName, contactPerson]);

  // Прогоняем шаблонную строку «{{key}}» через рендерер — получаем итоговое значение
  const resolved = useMemo(() => {
    return VARIABLES.map(v => {
      const value = applyProposalVariables(`{{${v.key}}}`, ctx);
      const isPlaceholder = value === `{{${v.key}}}` || value.trim() === "" || value === "#";
      return { ...v, value, isPlaceholder };
    });
  }, [ctx]);

  const renderedIntro = introHtml ? applyProposalVariables(introHtml, ctx) : "";
  const renderedOutro = outroHtml ? applyProposalVariables(outroHtml, ctx) : "";

  const renderedItems = items.map(it => ({
    name: applyProposalVariables(it.custom_name || "", ctx),
    description: it.custom_description ? applyProposalVariables(it.custom_description, ctx) : "",
  }));

  const hasMissingCourse = !course;
  const courseUrl = course?.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/c/${course.slug}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Проверка подстановки переменных курса</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasMissingCourse && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-orange-500/10 border border-orange-500/30 text-sm">
              <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <strong>Курс не выбран.</strong> Переменные {`{{course_name}}`}, {`{{course_duration}}`}, {`{{course_price}}`}, {`{{course_url}}`} останутся пустыми. Выберите курс в селекте «Курс для подстановки переменных» выше.
              </div>
            </div>
          )}

          {/* Таблица переменных */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Переменные и их значения</h4>
            <div className="border rounded-md divide-y">
              {resolved.map(r => (
                <div key={r.key} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm items-center">
                  <code className="col-span-3 text-xs bg-muted px-1.5 py-0.5 rounded">{`{{${r.key}}}`}</code>
                  <span className="col-span-3 text-xs text-muted-foreground">{r.label}</span>
                  <div className="col-span-5 truncate">
                    {r.isPlaceholder ? (
                      <span className="text-xs text-muted-foreground italic">— пусто —</span>
                    ) : r.key === "course_url" && courseUrl ? (
                      <a href={courseUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                        {courseUrl}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="font-medium">{r.value}</span>
                    )}
                  </div>
                  <div className="col-span-1 text-right">
                    {r.isPlaceholder ? (
                      <Badge variant="outline" className="text-[10px]">пусто</Badge>
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-600 inline-block" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Услуги */}
          {renderedItems.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Услуги (с подставленными значениями)</h4>
              <div className="border rounded-md divide-y">
                {renderedItems.map((it, idx) => (
                  <div key={idx} className="px-3 py-2 text-sm">
                    <div className="font-medium">{it.name || <span className="italic text-muted-foreground">(без названия)</span>}</div>
                    {it.description && <div className="text-xs text-muted-foreground mt-0.5">{it.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Маркетинговые блоки */}
          {(renderedIntro || renderedOutro) && (
            <div className="grid grid-cols-1 gap-3">
              {renderedIntro && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Вступительный блок (intro)</h4>
                  <div
                    className="border rounded-md p-3 text-sm bg-background prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: renderedIntro }}
                  />
                </div>
              )}
              {renderedOutro && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Заключительный блок (outro)</h4>
                  <div
                    className="border rounded-md p-3 text-sm bg-background prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: renderedOutro }}
                  />
                </div>
              )}
            </div>
          )}

          {!renderedIntro && !renderedOutro && renderedItems.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Нет блоков с переменными для проверки. Добавьте услуги или используйте пресет с маркетинговыми блоками.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
