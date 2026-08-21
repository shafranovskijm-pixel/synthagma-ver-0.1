import {
  BookOpenCheck,
  Building2,
  ContactRound,
  FileArchive,
  Files,
  MessagesSquare,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  filterHelpTutorials,
  type HelpTutorial,
  type HelpTutorialIcon,
} from "./helpTutorialData";

const tutorialIcons: Record<HelpTutorialIcon, typeof Building2> = {
  organization: Building2,
  course: BookOpenCheck,
  student: UserPlus,
  group: UsersRound,
  exchange: MessagesSquare,
  package: FileArchive,
  profile: ContactRound,
};

interface HelpTutorialsProps {
  query?: string;
  tutorials?: HelpTutorial[];
}

export function HelpTutorials({ query = "", tutorials }: HelpTutorialsProps) {
  const visibleTutorials = filterHelpTutorials(query, tutorials);

  if (visibleTutorials.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed border-2" data-testid="tutorials-empty-state">
        <CardContent className="p-8 text-center">
          <Files className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            По этому запросу обучающих инструкций не найдено.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div data-testid="help-tutorials">
      {query.trim() && (
        <p className="text-xs text-muted-foreground mb-3" aria-live="polite">
          Найдено инструкций: {visibleTutorials.length}
        </p>
      )}
      <Accordion type="multiple" className="space-y-3">
        {visibleTutorials.map((tutorial, tutorialIndex) => {
          const Icon = tutorialIcons[tutorial.icon];
          return (
            <AccordionItem
              key={tutorial.id}
              id={`tutorial-${tutorial.id}`}
              value={tutorial.id}
              className="border rounded-2xl px-4 sm:px-5 bg-card/70 data-[state=open]:border-teal-500/25 data-[state=open]:shadow-lg data-[state=open]:shadow-teal-500/5"
            >
              <AccordionTrigger className="hover:no-underline py-5 text-left">
                <div className="flex items-start gap-3 pr-3">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white shrink-0 shadow-md shadow-teal-500/15">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-sm sm:text-base">
                        {tutorialIndex + 1}. {tutorial.title}
                      </span>
                      <Badge variant="secondary" className="text-[10px] font-medium">
                        {tutorial.section}
                      </Badge>
                    </span>
                    <span className="block text-xs sm:text-sm text-muted-foreground font-normal leading-relaxed">
                      {tutorial.summary}
                    </span>
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-5">
                <ol className="space-y-4 border-t border-border/60 pt-4">
                  {tutorial.steps.map((step, stepIndex) => (
                    <li key={`${tutorial.id}-${stepIndex}`} className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-bold shrink-0">
                        {stepIndex + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-sm">{step.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                          {step.description}
                        </p>
                        {step.note && (
                          <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                            {step.note}
                          </p>
                        )}
                        {step.screenshots?.map((screenshot) => (
                          <figure key={screenshot.src} className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/20">
                            <img
                              src={screenshot.src}
                              alt={screenshot.alt}
                              loading="lazy"
                              className="w-full h-auto object-contain"
                            />
                            {screenshot.caption && (
                              <figcaption className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                                {screenshot.caption}
                              </figcaption>
                            )}
                          </figure>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
