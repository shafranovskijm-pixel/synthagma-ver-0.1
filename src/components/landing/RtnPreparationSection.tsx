import { ArrowRight, BookOpen, ClipboardList, FileSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { rtnWorkspaceHref } from "@/lib/rtnWorkspaceNavigation";

const preparationHref = `/login?next=${encodeURIComponent(rtnWorkspaceHref({ view: "training" }))}`;

const preparationFeatures = [
  {
    icon: BookOpen,
    title: "Вопросы и источники",
    description: "Публикация и редакция вопросов — рядом с учебными пояснениями.",
  },
  {
    icon: FileSearch,
    title: "Изменения и проверка",
    description: "Состояние источника и проверка учебных ответов показаны отдельно.",
  },
  {
    icon: ClipboardList,
    title: "Подготовка и результаты",
    description: "Назначение подготовки и результаты слушателей — в одном кабинете.",
  },
];

export function RtnPreparationSection() {
  return (
    <section aria-labelledby="rtn-preparation-heading" className="relative py-12 md:py-16">
      <div className="container mx-auto max-w-6xl px-6">
        <div className="rounded-3xl border border-accent/20 bg-gradient-to-br from-accent/5 via-card to-background p-6 md:p-10">
          <div className="grid min-w-0 gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="min-w-0">
              <span className="mb-5 inline-flex rounded-full bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent">
                Пилот подготовки
              </span>
              <h2 id="rtn-preparation-heading" className="mb-4 font-display text-3xl font-medium leading-tight tracking-tight md:text-4xl">
                Ростехнадзор — подготовка в СИНТАГМЕ
              </h2>
              <p className="mb-6 text-base leading-relaxed text-muted-foreground md:text-lg">
                Вопросы из официальных публикаций и учебные пояснения СИНТАГМЫ — в разделе «Курсы».
                Доступные области и их готовность показаны в кабинете.
              </p>
              <Button asChild className="btn-gradient h-auto min-h-[48px] w-full max-w-[calc(100%_-_3rem)] gap-2 whitespace-normal rounded-xl px-5 py-3 text-sm sm:w-auto sm:max-w-none">
                <Link to={preparationHref}>
                  Открыть подготовку
                  <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                </Link>
              </Button>
            </div>

            <ul className="min-w-0 space-y-4">
              {preparationFeatures.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex min-w-0 gap-3 rounded-2xl border border-border/60 bg-background/60 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-7 border-t border-border/60 pt-5 text-sm leading-relaxed text-muted-foreground">
            Учебные ответы СИНТАГМЫ не являются официальными ключами. Подготовка не заменяет аттестацию.
          </p>
        </div>
      </div>
    </section>
  );
}
