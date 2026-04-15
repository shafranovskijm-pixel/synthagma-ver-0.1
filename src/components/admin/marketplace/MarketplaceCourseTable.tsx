import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye, Edit, Trash2, ChevronDown, FolderInput, FolderOpen,
  CheckCircle2, AlertTriangle, GripVertical, BookOpen } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type CourseGroup = { baseTitle: string; items: any[]; suffix: (item: any) => string };

function groupSimilarCourses(courses: any[]): (any | CourseGroup)[] {
  const map = new Map<string, any[]>();
  const order: string[] = [];
  for (const c of courses) {
    const title: string = c.course?.title || "";
    const dashIdx = title.indexOf(" — ");
    const base = dashIdx > 0 ? title.substring(0, dashIdx) : title;
    if (!map.has(base)) {
      map.set(base, []);
      order.push(base);
    }
    map.get(base)!.push(c);
  }
  const result: (any | CourseGroup)[] = [];
  for (const base of order) {
    const items = map.get(base)!;
    if (items.length >= 2) {
      result.push({
        baseTitle: base,
        items,
        suffix: (item: any) => {
          const title: string = item.course?.title || "";
          const dashIdx = title.indexOf(" — ");
          return dashIdx > 0 ? title.substring(dashIdx) : "";
        } });
    } else {
      result.push(items[0]);
    }
  }
  return result;
}

function isGroup(entry: any): entry is CourseGroup {
  return entry && Array.isArray(entry.items);
}

interface CourseRowProps {
  item: any;
  h: any;
  onBulkGenerate: (item: any) => void;
  validatedCourses: Record<string, 'ok' | 'error'>;
  onValidate: (courseId: string) => void;
  validatingId: string | null;
  selectedCourses?: Set<string>;
  onToggleSelect?: (id: string) => void;
  suffix?: string;
}

function CourseRowContent({
  item, h, onBulkGenerate, validatedCourses, onValidate, validatingId,
  selectedCourses, onToggleSelect, suffix }: CourseRowProps) {
  const navigate = useNavigate();
  const status = validatedCourses[item.course_id];
  const displayTitle = suffix !== undefined ? (suffix || item.course?.title || "") : (item.course?.title || "");
  
  return (
    <TableRow key={item.id} className={!item.is_active ? "opacity-60" : ""}>
      {selectedCourses && onToggleSelect && (
        <TableCell className="w-[40px] pr-0">
          <Checkbox
            checked={selectedCourses.has(item.course_id)}
            onCheckedChange={() => onToggleSelect(item.course_id)}
          />
        </TableCell>
      )}
      <TableCell>
        <button
          className={`text-sm text-left hover:underline cursor-pointer inline-flex items-center gap-1.5${suffix !== undefined ? ' pl-2' : ''}`}
          onClick={() => onValidate(item.course_id)}
          disabled={validatingId === item.course_id}
        >
          {validatingId === item.course_id && <SigmaSpinner size="xs" />}
          {status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
          {status === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          {displayTitle}
        </button>
      </TableCell>
      <TableCell className="w-[100px] text-sm">{item.price_student.toLocaleString()} ₽</TableCell>
      <TableCell className="w-[100px] text-sm">{item.price_organization.toLocaleString()} ₽</TableCell>
      <TableCell className="w-[60px]">
        <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
      </TableCell>
      <TableCell className="w-[160px]">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Войти" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Переместить в категорию" onClick={() => { h.setMovingCourse(item); h.setTargetCategory(h.extractCategory(item.course?.title)); h.setShowMoveCategoryDialog(true); }}>
            <FolderInput className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Просмотр" onClick={() => onBulkGenerate(item)}>
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function renderGroupedCourses(
  courses: any[], h: any, onBulkGenerate: (item: any) => void,
  validatedCourses: Record<string, 'ok' | 'error'>, onValidate: (courseId: string) => void, validatingId: string | null,
  selectedCourses?: Set<string>, onToggleSelect?: (id: string) => void
) {
  const grouped = groupSimilarCourses(courses);
  return (
    <Table>
      <TableBody>
        {grouped.map((entry, idx) => {
          if (isGroup(entry)) {
            const g = entry as CourseGroup;
            return (
              <TableRow key={`group-${idx}`} className="hover:bg-transparent">
                <TableCell colSpan={selectedCourses ? 6 : 5} className="p-0">
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-secondary/30 transition-colors text-sm font-medium text-left">
                      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [&[data-state=closed]]:-rotate-90 shrink-0" />
                      <span className="flex-1">{g.baseTitle}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {g.items.length} {g.items.length < 5 ? 'варианта' : 'вариантов'}
                      </Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                        <TableBody>
                          {g.items.map(item => (
                            <CourseRowContent
                              key={item.id} item={item} h={h} onBulkGenerate={onBulkGenerate}
                              validatedCourses={validatedCourses} onValidate={onValidate} validatingId={validatingId}
                              selectedCourses={selectedCourses} onToggleSelect={onToggleSelect}
                              suffix={g.suffix(item)}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                </TableCell>
              </TableRow>
            );
          }
          return (
            <CourseRowContent
              key={entry.id} item={entry} h={h} onBulkGenerate={onBulkGenerate}
              validatedCourses={validatedCourses} onValidate={onValidate} validatingId={validatingId}
              selectedCourses={selectedCourses} onToggleSelect={onToggleSelect}
            />
          );
        })}
      </TableBody>
    </Table>
  );
}

export function SortableCategoryItem({ group, children }: { group: { category: string; categoryId?: string }; children: React.ReactNode }) {
  const id = group.categoryId || group.category;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center">
        <button {...attributes} {...listeners} className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
