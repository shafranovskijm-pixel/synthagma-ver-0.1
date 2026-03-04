import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Zap, Shield, Settings2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { ParsedSection } from "@/utils/excelTestBulkParser";
import {
  VOLTAGE_OPTIONS, GROUP_OPTIONS, VoltageKey, GroupKey, CourseCombo,
} from "./types";

interface Props {
  sections: ParsedSection[];
  onGenerate: (combos: CourseCombo[], priceStudent: number, priceOrg: number) => void;
  onReset: () => void;
}

export function ConfigStep({ sections, onGenerate, onReset }: Props) {
  const [selectedVoltages, setSelectedVoltages] = useState<Set<VoltageKey>>(
    new Set(VOLTAGE_OPTIONS.map(v => v.key))
  );
  const [selectedGroups, setSelectedGroups] = useState<Set<GroupKey>>(
    new Set(GROUP_OPTIONS.map(g => g.key))
  );
  const [perCombo, setPerCombo] = useState(true);
  const [priceStudent, setPriceStudent] = useState("5000");
  const [priceOrg, setPriceOrg] = useState("3000");
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const toggleVoltage = (key: VoltageKey) => {
    setSelectedVoltages(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleGroup = (key: GroupKey) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Build course combos from sections × selected voltage × selected group
  const combos = useMemo(() => {
    const result: CourseCombo[] = [];

    sections.forEach((section, sIdx) => {
      // Sections without tags → single course with all questions
      if (section.noTags) {
        result.push({
          sectionIdx: sIdx,
          sectionTitle: section.title,
          voltage: "v1000" as VoltageKey,
          voltageLabel: "Все",
          group: "gII" as GroupKey,
          groupLabel: "Все",
          questionCount: section.questions.length,
          customTitle: section.customTitle || section.title,
          selected: true,
        });
        return;
      }

      if (!perCombo) {
        // One course per section, include all questions that match ANY selected filter
        const matchingQs = section.questions.filter(q => {
          const hasVoltage = [...selectedVoltages].some(v => q.tags[v]);
          const hasGroup = [...selectedGroups].some(g => q.tags[g]);
          return hasVoltage && hasGroup;
        });
        if (matchingQs.length > 0) {
          result.push({
            sectionIdx: sIdx,
            sectionTitle: section.title,
            voltage: "v1000" as VoltageKey,
            voltageLabel: "Все",
            group: "gII" as GroupKey,
            groupLabel: "Все",
            questionCount: matchingQs.length,
            customTitle: section.customTitle || section.title,
            selected: true,
          });
        }
        return;
      }

      for (const v of VOLTAGE_OPTIONS) {
        if (!selectedVoltages.has(v.key)) continue;
        for (const g of GROUP_OPTIONS) {
          if (!selectedGroups.has(g.key)) continue;
          const matchingQs = section.questions.filter(
            q => q.tags[v.key] && q.tags[g.key]
          );
          if (matchingQs.length > 0) {
            result.push({
              sectionIdx: sIdx,
              sectionTitle: section.title,
              voltage: v.key,
              voltageLabel: v.label,
              group: g.key,
              groupLabel: g.label,
              questionCount: matchingQs.length,
              customTitle: `${section.customTitle || section.title} — ${v.label} — Группа ${g.label}`,
              selected: true,
            });
          }
        }
      }
    });

    return result;
  }, [sections, selectedVoltages, selectedGroups, perCombo]);

  const [comboSelections, setComboSelections] = useState<Record<string, boolean>>({});

  const toggleCombo = (idx: number) => {
    setComboSelections(prev => ({ ...prev, [idx]: !(prev[idx] ?? true) }));
  };

  const updateComboTitle = (idx: number, title: string) => {
    // We'll pass the updated title through in the final combos
    combos[idx].customTitle = title;
  };

  const selectedCombos = combos.filter((_, i) => comboSelections[i] !== false);
  const totalQuestions = selectedCombos.reduce((s, c) => s + c.questionCount, 0);

  const handleGenerate = () => {
    if (selectedCombos.length === 0) return;
    onGenerate(
      combos.filter((_, i) => comboSelections[i] !== false),
      parseFloat(priceStudent) || 5000,
      parseFloat(priceOrg) || 3000
    );
  };

  // Stats for tag distribution
  const tagStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const v of VOLTAGE_OPTIONS) stats[v.key] = 0;
    for (const g of GROUP_OPTIONS) stats[g.key] = 0;
    sections.forEach(s => s.questions.forEach(q => {
      for (const v of VOLTAGE_OPTIONS) if (q.tags[v.key]) stats[v.key]++;
      for (const g of GROUP_OPTIONS) if (q.tags[g.key]) stats[g.key]++;
    }));
    return stats;
  }, [sections]);

  return (
    <div className="space-y-4">
      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <div className="text-2xl font-bold text-primary">{sections.length}</div>
            <div className="text-xs text-muted-foreground">Разделов</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {sections.reduce((s, p) => s + p.questions.length, 0)}
            </div>
            <div className="text-xs text-muted-foreground">Вопросов всего</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <div className="text-2xl font-bold text-amber-500">{selectedCombos.length}</div>
            <div className="text-xs text-muted-foreground">Курсов к созданию</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <div className="text-2xl font-bold text-green-500">{totalQuestions}</div>
            <div className="text-xs text-muted-foreground">Вопросов в выборке</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base font-display">Фильтры</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onReset}>Сбросить файл</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Per-combo toggle */}
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <Switch checked={perCombo} onCheckedChange={setPerCombo} />
            <div>
              <div className="text-sm font-medium">Курс на каждую комбинацию</div>
              <div className="text-xs text-muted-foreground">
                {perCombo
                  ? "Отдельный курс для каждого сочетания напряжения × группы"
                  : "Один курс на раздел с объединёнными вопросами"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Voltage */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="w-4 h-4 text-amber-500" />Напряжение
              </div>
              {VOLTAGE_OPTIONS.map(v => (
                <label key={v.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedVoltages.has(v.key)}
                    onCheckedChange={() => toggleVoltage(v.key)}
                  />
                  <span>{v.label}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {tagStats[v.key]} вопросов
                  </Badge>
                </label>
              ))}
            </div>

            {/* Groups */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Shield className="w-4 h-4 text-blue-500" />Группа по электробезопасности
              </div>
              {GROUP_OPTIONS.map(g => (
                <label key={g.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedGroups.has(g.key)}
                    onCheckedChange={() => toggleGroup(g.key)}
                  />
                  <span>Группа {g.label}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {tagStats[g.key]} вопросов
                  </Badge>
                </label>
              ))}
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
            <div className="space-y-1">
              <Label className="text-xs">Цена для студентов (₽)</Label>
              <Input type="number" value={priceStudent} onChange={e => setPriceStudent(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Цена для организаций (₽)</Label>
              <Input type="number" value={priceOrg} onChange={e => setPriceOrg(e.target.value)} className="rounded-xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections preview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-display">Разделы</CardTitle>
          <CardDescription>Нажмите на раздел, чтобы увидеть вопросы и их теги</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {sections.map((section, idx) => {
            const isOpen = expandedSection === idx;
            return (
              <Collapsible key={idx} open={isOpen} onOpenChange={() => setExpandedSection(isOpen ? null : idx)}>
                 <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                   {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                   <span className="text-sm font-medium truncate flex-1">{section.title}</span>
                   {section.noTags && (
                     <Badge variant="outline" className="text-xs shrink-0">без тегов</Badge>
                   )}
                   <Badge variant="secondary" className="text-xs">{section.questions.length} вопросов</Badge>
                 </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-6 mb-2 max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-8">#</TableHead>
                          <TableHead className="text-xs">Вопрос</TableHead>
                          <TableHead className="text-xs w-16">до 1кВ</TableHead>
                          <TableHead className="text-xs w-16">выше</TableHead>
                          <TableHead className="text-xs w-8">II</TableHead>
                          <TableHead className="text-xs w-8">III</TableHead>
                          <TableHead className="text-xs w-8">IV</TableHead>
                          <TableHead className="text-xs w-8">V</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.questions.slice(0, 20).map((q, qi) => (
                          <TableRow key={qi}>
                            <TableCell className="text-xs py-1">{qi + 1}</TableCell>
                            <TableCell className="text-xs py-1 max-w-[300px] truncate">{q.question}</TableCell>
                            <TableCell className="text-xs py-1 text-center">{q.tags.v1000 ? "✓" : ""}</TableCell>
                            <TableCell className="text-xs py-1 text-center">{q.tags.vAbove1000 ? "✓" : ""}</TableCell>
                            <TableCell className="text-xs py-1 text-center">{q.tags.gII ? "✓" : ""}</TableCell>
                            <TableCell className="text-xs py-1 text-center">{q.tags.gIII ? "✓" : ""}</TableCell>
                            <TableCell className="text-xs py-1 text-center">{q.tags.gIV ? "✓" : ""}</TableCell>
                            <TableCell className="text-xs py-1 text-center">{q.tags.gV ? "✓" : ""}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {section.questions.length > 20 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        ... и ещё {section.questions.length - 20} вопросов
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Generated courses preview */}
      {combos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display">
              Курсы к созданию ({selectedCombos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto space-y-2">
              {combos.map((combo, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-3 py-2 px-3 rounded-lg border ${
                    comboSelections[idx] === false ? "opacity-40 border-border" : "border-border"
                  }`}
                >
                  <Checkbox
                    checked={comboSelections[idx] !== false}
                    onCheckedChange={() => toggleCombo(idx)}
                  />
                  <div className="flex-1 min-w-0">
                    <Input
                      value={combo.customTitle}
                      onChange={e => updateComboTitle(idx, e.target.value)}
                      className="h-8 text-sm rounded-lg border-transparent hover:border-border focus:border-primary"
                      disabled={comboSelections[idx] === false}
                    />
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {combo.questionCount} вопросов
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create button */}
      <Button
        className="w-full btn-gradient rounded-xl"
        size="lg"
        onClick={handleGenerate}
        disabled={selectedCombos.length === 0}
      >
        Создать {selectedCombos.length} курсов ({totalQuestions} вопросов)
      </Button>
    </div>
  );
}
