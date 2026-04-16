import {
  ArrowLeft, Sparkles, CheckCircle2, AlertTriangle,
  FolderOpen, Plus, BookOpen, ChevronDown,
} from "lucide-react";
import type { DbCategory } from "@/hooks/useAdminMarketplace";
import {
  useContentGenerator, PHASE_LABELS,
  type MarketplaceCourseWithDetails,
} from "@/hooks/useContentGenerator";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Props {
  courses: MarketplaceCourseWithDetails[];
  dbCategories: DbCategory[];
  onComplete: () => void;
}

export function ContentGeneratorTab({ courses, dbCategories, onComplete }: Props) {
  const h = useContentGenerator(courses, dbCategories, onComplete);

  if (!h.selectedCategoryId) {
    return <CategoryOverview h={h} />;
  }

  return <CategoryDetailView h={h} />;
}

function CategoryOverview({ h }: { h: ReturnType<typeof useContentGenerator> }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Генератор контента
          </CardTitle>
          <p className="text-sm text-muted-foreground">Выберите категорию для просмотра и генерации курсов</p>
        </CardHeader>
      </Card>

      {h.categoryGroups.map((group) => (
        <Collapsible key={group.type} defaultOpen>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
                    {group.type}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">{group.categories.length} категорий</Badge>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {group.categories.map((cat) => {
                    const count = h.coursesPerCategory(cat.id);
                    return (
                      <button key={cat.id} onClick={() => h.setSelectedCategoryId(cat.id)} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 hover:border-primary/30 transition-colors text-left">
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{cat.name}</span>
                        </div>
                        <Badge variant={count > 0 ? "default" : "outline"} className="text-xs shrink-0 ml-2">{count}</Badge>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}

function CategoryDetailView({ h }: { h: ReturnType<typeof useContentGenerator> }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => h.setSelectedCategoryId(null)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <CardTitle className="text-base">{h.selectedCategory?.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {h.categoryCourses.length} курсов
                  {!h.analyzing && h.totalEmpty > 0 && <span className="text-amber-600"> • {h.totalEmpty} без контента</span>}
                  {!h.analyzing && h.totalUnanswered > 0 && <span className="text-amber-600"> • {h.totalUnanswered} нерешённых вопросов</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={h.analyzeCategory} disabled={h.analyzing}>
                {h.analyzing ? <SigmaSpinner size="xs" className=".5 .5 mr-1" /> : null}
                Обновить
              </Button>
              <Button size="sm" onClick={h.handleGenerateAll} disabled={!!h.generatingCourseId || h.analyzing || h.categoryCourses.length === 0} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Сгенерировать все
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {h.generatingCourseId && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <SigmaSpinner size="sm" />
                {PHASE_LABELS[h.generatingPhase]}
              </span>
              <span className="font-medium">{h.generatingProgress}%</span>
            </div>
            <Progress value={h.generatingProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {h.analyzing ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <SigmaSpinner size="sm" />Анализ курсов...
            </div>
          ) : h.categoryCourses.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Нет курсов в этой категории</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Курс</TableHead>
                  <TableHead className="w-[80px] text-center">Уроки</TableHead>
                  <TableHead className="w-[80px] text-center">Пустые</TableHead>
                  <TableHead className="w-[80px] text-center">Тесты</TableHead>
                  <TableHead className="w-[100px] text-center">Нерешённые</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {h.categoryCourses.map((mc) => {
                  const a = h.courseAnalyses[mc.course_id];
                  const isGenerating = h.generatingCourseId === mc.course_id;
                  const needsWork = a && (a.totalLessons === 0 || a.emptyLessons > 0 || a.unansweredQuestions > 0);
                  const isReady = a && !needsWork;
                  return (
                    <TableRow key={mc.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isReady && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                          {needsWork && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span className="text-sm truncate max-w-[300px]">{mc.course?.title || ""}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">{a ? a.totalLessons : "—"}</TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? (a.emptyLessons > 0 ? <span className="text-amber-600 font-medium">{a.emptyLessons}</span> : <span className="text-green-600">0</span>) : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">{a ? a.totalTests : "—"}</TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? (a.unansweredQuestions > 0 ? <span className="text-amber-600 font-medium">{a.unansweredQuestions}</span> : <span className="text-green-600">0</span>) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant={needsWork ? "default" : "outline"} onClick={() => h.handleGenerateCourse(mc.course_id, mc.course?.title || "")} disabled={!!h.generatingCourseId} className="gap-1 h-7 text-xs">
                          {isGenerating ? <SigmaSpinner size="xs" /> : <Sparkles className="w-3 h-3" />}
                          {a?.totalLessons === 0 ? "Создать" : "Заполнить"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input placeholder="Название нового курса..." value={h.newCourseName} onChange={(e) => h.setNewCourseName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && h.handleCreateCourse()} className="h-9" />
            <Button size="sm" onClick={h.handleCreateCourse} disabled={!h.newCourseName.trim() || h.creatingCourse} className="gap-1 shrink-0">
              {h.creatingCourse ? <SigmaSpinner size="xs" className=".5 .5" /> : <Plus className="w-3.5 h-3.5" />}
              Создать
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
