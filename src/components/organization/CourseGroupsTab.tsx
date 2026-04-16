import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarIcon, Users, UserPlus, Check, Plus, Copy, Link as LinkIcon } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useCourseGroups, GROUP_COLORS } from "@/hooks/useCourseGroups";

interface CourseGroupsTabProps { courseId: string; organizationId: string; onRefreshStudents?: () => void; }

export function CourseGroupsTab({ courseId, organizationId, onRefreshStudents }: CourseGroupsTabProps) {
  const h = useCourseGroups(courseId, organizationId, onRefreshStudents);

  const addStudentsDialog = (
    <Dialog open={h.showAddStudentsDialog} onOpenChange={h.setShowAddStudentsDialog}>
      <DialogContent className="rounded-2xl max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Добавить учеников в «{h.selectedGroupForAdd?.name}»</DialogTitle></DialogHeader>
        {h.showNewStudentForm ? (
          <div className="space-y-3 p-3 rounded-xl border border-border bg-muted/30">
            <div className="text-sm font-medium">Новый ученик</div>
            <Input placeholder="ФИО *" value={h.newStudentName} onChange={e => h.setNewStudentName(e.target.value)} className="rounded-xl" />
            <Input placeholder="Email (необязательно)" value={h.newStudentEmail} onChange={e => h.setNewStudentEmail(e.target.value)} className="rounded-xl" type="email" />
            <div className="flex gap-2">
              <Button size="sm" className="rounded-xl flex-1" disabled={!h.newStudentName.trim() || h.creatingStudent} onClick={h.handleCreateStudentInGroup}>
                {h.creatingStudent ? <SigmaSpinner size="sm" className="mr-1" /> : <Plus className="w-4 h-4 mr-1" />}Создать
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => h.setShowNewStudentForm(false)}>Отмена</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 self-start" onClick={() => h.setShowNewStudentForm(true)}>
            <Plus className="w-4 h-4" />Создать нового ученика
          </Button>
        )}
        <div className="flex-1 overflow-y-auto space-y-1 py-2">
          {h.loadingStudents ? <div className="flex justify-center py-8"><SigmaSpinner /></div>
            : h.unassignedStudents.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Нет учеников без группы</p>
            : h.unassignedStudents.map(s => (
              <label key={s.user_id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={h.selectedStudentIds.has(s.user_id)} onCheckedChange={() => h.toggleStudent(s.user_id)} />
                <div className="min-w-0"><div className="text-sm font-medium truncate">{s.full_name || "Без имени"}</div>{s.email && <div className="text-xs text-muted-foreground truncate">{s.email}</div>}</div>
              </label>
            ))}
        </div>
        {h.unassignedStudents.length > 0 && (
          <Button className="w-full btn-gradient rounded-xl mt-2" disabled={h.selectedStudentIds.size === 0 || h.addingStudents} onClick={h.handleAddStudentsToGroup}>
            {h.addingStudents ? <SigmaSpinner size="sm" className="mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}Добавить ({h.selectedStudentIds.size})
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );

  const createGroupDialog = (
    <Dialog open={h.showCreateDialog} onOpenChange={h.setShowCreateDialog}>
      <DialogContent className="rounded-2xl">
        <DialogHeader><DialogTitle>Создать группу</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2"><label className="text-sm font-medium">Название группы</label><Input placeholder="Например: Группа А-2026" value={h.newGroupName} onChange={e => h.setNewGroupName(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Цвет</label>
            <div className="flex gap-2 flex-wrap">{GROUP_COLORS.map(c => (<button key={c} className={cn("w-8 h-8 rounded-full transition-all border-2", h.newGroupColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105")} style={{ backgroundColor: c }} onClick={() => h.setNewGroupColor(c)} />))}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><label className="text-sm font-medium">Дата начала набора</label><DatePicker date={h.newGroupStartDate} onChange={h.setNewGroupStartDate} placeholder="Начало" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Дата окончания набора</label><DatePicker date={h.newGroupEndDate} onChange={h.setNewGroupEndDate} placeholder="Конец" /></div>
          </div>
          <div className="p-3 rounded-xl bg-muted/50 border border-border/50"><div className="flex items-center gap-2 text-xs text-muted-foreground"><LinkIcon className="w-3.5 h-3.5" />Ссылка для регистрации будет создана автоматически</div></div>
          <Button className="w-full btn-gradient rounded-xl" onClick={h.handleCreateGroup} disabled={h.isCreating || !h.newGroupName.trim()}>
            {h.isCreating ? <SigmaSpinner size="sm" className="mr-2" /> : <Plus className="w-4 h-4 mr-2" />}Создать группу
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (h.loading) return <div className="flex items-center justify-center py-12"><SigmaSpinner />{createGroupDialog}</div>;

  if (h.groups.length === 0) return (
    <><div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center mb-4"><Users className="w-8 h-8 text-blue-500" /></div>
      <h3 className="text-lg font-semibold mb-2">Группы учеников</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">Группы позволяют массово зачислять учеников на курс и управлять расписанием обучения.</p>
      <Button className="btn-gradient rounded-xl gap-2" onClick={() => h.setShowCreateDialog(true)}><Plus className="w-4 h-4" />Создать группу</Button>
    </div>{createGroupDialog}</>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Группы организации</h3>
        <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => h.setShowCreateDialog(true)}><Plus className="w-4 h-4" />Создать группу</Button>
      </div>
      <div className="space-y-2">
        {h.groups.map(group => {
          const total = h.groupStudentCounts[group.id] || 0;
          const enrolled = h.enrolledCounts[group.id] || 0;
          const available = total - enrolled;
          const allEnrolled = total > 0 && enrolled >= total;
          const isEnrolling = h.enrollingGroupId === group.id;
          const hasLink = !!h.groupLinks[group.id];
          return (
            <div key={group.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border/50">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color || "#6366f1" }} />
                <div className="min-w-0"><div className="font-medium text-sm">{group.name}</div><div className="text-xs text-muted-foreground">{total} уч. · {enrolled} зачислено{available > 0 && <span className="text-primary font-medium"> · {available} доступно</span>}</div></div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DatePicker date={group.start_date ? new Date(group.start_date) : undefined} onChange={d => h.handleUpdateDate(group.id, "start_date", d)} placeholder="Начало" />
                <span className="text-muted-foreground text-xs">—</span>
                <DatePicker date={group.end_date ? new Date(group.end_date) : undefined} onChange={d => h.handleUpdateDate(group.id, "end_date", d)} placeholder="Конец" />
                {hasLink && <Button size="sm" variant="ghost" className="rounded-xl gap-1.5 text-xs" onClick={() => h.handleCopyLink(group.id)} title="Скопировать ссылку регистрации"><Copy className="w-3.5 h-3.5" />Ссылка</Button>}
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" onClick={() => h.handleOpenAddStudents(group)}><UserPlus className="w-3.5 h-3.5" />+ Ученики</Button>
                <Button size="sm" className="rounded-xl gap-1.5 ml-1" disabled={isEnrolling || allEnrolled} onClick={() => h.handleEnrollGroup(group.id)}>
                  {isEnrolling ? <SigmaSpinner size="sm" /> : allEnrolled ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}{allEnrolled ? "Зачислены" : "Зачислить"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {createGroupDialog}
      {addStudentsDialog}
    </div>
  );
}

function DatePicker({ date, onChange, placeholder }: { date?: Date; onChange: (d: Date | undefined) => void; placeholder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal text-xs rounded-lg h-8", !date && "text-muted-foreground")}>
          <CalendarIcon className="w-3 h-3 mr-1" />{date ? format(date, "dd.MM.yy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={date} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} /></PopoverContent>
    </Popover>
  );
}
