import React from "react";
import { Copy, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import type { Student } from "@/types";

interface StudentMobileCardProps {
  student: Student;
  isSelected: boolean;
  onToggleSelection: () => void;
  onViewStudent: () => void;
  onCopyCredentials: (login: string, password: string) => void;
  studentDocsByUser: Map<string, string[]>;
}

export const StudentMobileCard = React.memo(function StudentMobileCard({
  student, isSelected, onToggleSelection, onViewStudent, onCopyCredentials, studentDocsByUser,
}: StudentMobileCardProps) {
  const userDocs = studentDocsByUser.get(student.user_id) || [];
  const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
  const hasSnils = userDocs.includes("snils");
  const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
  const enrollmentsCount = student.enrollments?.length || 0;

  return (
    <div className={`p-4 ${isSelected ? 'bg-primary/5' : ''}`} onClick={() => onViewStudent()}>
      <div className="flex items-start gap-3">
        <div onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isSelected} onChange={onToggleSelection} className="w-4 h-4 rounded border-border mt-1" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{student.name}</div>
              {student.login && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono">{student.login}</span>
                  {student.generated_password && (
                    <button onClick={e => { e.stopPropagation(); onCopyCredentials(student.login!, student.generated_password!); }} className="p-1 hover:bg-muted rounded transition-colors">
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${student.status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : student.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {student.status === 'completed' ? 'Завершил' : student.status === 'active' ? 'Активный' : '—'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="truncate">{enrollmentsCount === 0 ? 'Не зачислен' : enrollmentsCount === 1 ? student.course : `${enrollmentsCount} курс(а)`}</span>
            <span className="shrink-0">{Math.min(student.progress, 100)}%</span>
          </div>
          <div className="flex items-center gap-1 mt-2">
            {[hasPassport, hasSnils, hasEducation].map((has, i) => (
              <div key={i} className={`w-5 h-5 rounded flex items-center justify-center ${has ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {has ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
              </div>
            ))}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
});
