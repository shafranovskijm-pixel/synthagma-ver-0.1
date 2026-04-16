import React from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Trash2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import type { Student, StudentFRDOStatus } from "@/types";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

interface StudentTableRowProps {
  student: Student;
  isSelected: boolean;
  onToggleSelection: () => void;
  onViewStudent: () => void;
  onCopyCredentials: (login: string, password: string) => void;
  onRemoveStudent: (userId: string) => void;
  studentDocsByUser: Map<string, string[]>;
  frdoStatus: Map<string, StudentFRDOStatus>;
  studentGroups: Array<{ id: string; name: string; color: string }>;
  studentGroupMap: Map<string, string>;
  onAssignGroup: (userId: string, groupId: string | null) => void;
}

export const StudentTableRow = React.memo(function StudentTableRow({
  student, isSelected, onToggleSelection, onViewStudent, onCopyCredentials,
  onRemoveStudent, studentDocsByUser, frdoStatus, studentGroups, studentGroupMap, onAssignGroup,
}: StudentTableRowProps) {
  const enrollmentsCount = student.enrollments?.length || 0;
  const userDocs = studentDocsByUser.get(student.user_id) || [];
  const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
  const hasSnils = userDocs.includes("snils");
  const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
  const gId = studentGroupMap.get(student.user_id);
  const isOnline = student.last_visit_at && (Date.now() - new Date(student.last_visit_at).getTime()) < 5 * 60 * 1000;
  const status = frdoStatus.get(student.user_id);

  return (
    <tr className={`border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`} onClick={() => onViewStudent()}>
      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={isSelected} onChange={onToggleSelection} className="w-4 h-4 rounded border-border" />
      </td>
      <td className="px-6 py-4">
        <div>
          <div className="font-medium">{student.name}</div>
          <div className="text-sm text-muted-foreground">
            {student.login ? (
              <div className="flex flex-col gap-0.5">
                <span className="inline-flex items-center gap-2">
                  <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono">{student.login}</span>
                  {student.generated_password && <span className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-xs font-mono">{student.generated_password}</span>}
                  {student.login && student.generated_password && (
                    <button onClick={e => { e.stopPropagation(); onCopyCredentials(student.login!, student.generated_password!); }} className="p-1 hover:bg-muted rounded transition-colors" title="Копировать логин и пароль">
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                </span>
                {student.email && <span className="text-muted-foreground/50 text-xs">{student.email}</span>}
              </div>
            ) : student.email}
          </div>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
          <span className="text-xs text-muted-foreground">{isOnline ? 'онлайн' : student.last_visit_at ? formatTimeAgo(student.last_visit_at) : '—'}</span>
        </div>
      </td>
      <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
        <Select value={gId || "none"} onValueChange={v => onAssignGroup(student.user_id, v === "none" ? null : v)}>
          <SelectTrigger className="w-28 h-7 text-xs rounded-lg"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {studentGroups.map(g => (
              <SelectItem key={g.id} value={g.id}>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />{g.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1">
          {[{ has: hasPassport, title: hasPassport ? 'Паспорт загружен' : 'Нет паспорта' },
            { has: hasSnils, title: hasSnils ? 'СНИЛС загружен' : 'Нет СНИЛС' },
            { has: hasEducation, title: hasEducation ? 'Документ об образовании загружен' : 'Нет документа об образовании' }
          ].map((d, i) => (
            <div key={i} className={`w-6 h-6 rounded flex items-center justify-center ${d.has ? 'bg-green-500/10' : 'bg-red-500/10'}`} title={d.title}>
              {d.has ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
            </div>
          ))}
        </div>
      </td>
      <td className="px-3 py-4">
        {!status || !status.hasData ? (
          <div className="w-6 h-6 rounded flex items-center justify-center bg-muted" title="Данные ФРДО не заполнены"><XCircle className="w-3.5 h-3.5 text-muted-foreground" /></div>
        ) : status.isComplete ? (
          <div className="w-6 h-6 rounded flex items-center justify-center bg-green-500/10" title="Все данные ФРДО заполнены"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /></div>
        ) : (
          <div className="w-6 h-6 rounded flex items-center justify-center bg-amber-500/10" title={`Не заполнено: ${status.missingFields.join(", ")}`}><AlertCircle className="w-3.5 h-3.5 text-amber-500" /></div>
        )}
      </td>
      <td className="px-6 py-4 text-sm max-w-[200px]">
        {enrollmentsCount === 0 ? <span className="text-muted-foreground italic">Не зачислен</span> :
         enrollmentsCount === 1 ? <span className="truncate block">{student.course}</span> : (
          <div className="space-y-1">
            {student.enrollments?.slice(0, 2).map(e => <span key={e.id} className="block truncate text-xs">{e.course_title}</span>)}
            {enrollmentsCount > 2 && <span className="text-xs text-muted-foreground">+{enrollmentsCount - 2} ещё</span>}
          </div>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <Progress value={Math.min(student.progress, 100)} className="w-20 h-2" />
          <span className="text-sm font-medium">{Math.min(student.progress, 100)}%</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${student.status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : student.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          {student.status === 'completed' ? 'Завершил' : student.status === 'active' ? 'Активный' : '—'}
        </span>
      </td>
      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
        <div className="flex gap-2">
          {student.login && student.generated_password && (
            <Button variant="outline" size="sm" className="rounded-lg gap-1" onClick={() => onCopyCredentials(student.login!, student.generated_password!)} title="Копировать логин и пароль"><Copy className="w-4 h-4" /></Button>
          )}
          <Button variant="outline" size="sm" className="rounded-lg text-destructive hover:text-destructive" onClick={() => onRemoveStudent(student.user_id)} title="Удалить ученика"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </td>
    </tr>
  );
});
