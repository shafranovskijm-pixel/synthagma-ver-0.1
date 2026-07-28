import React, { useState, useCallback } from "react";
import { Copy, CheckCircle2, XCircle, ChevronRight, Loader2 } from "lucide-react";
import type { Student } from "@/types";

interface StudentMobileCardProps {
  student: Student;
  isSelected: boolean;
  onToggleSelection: () => void;
  onViewStudent: () => void;
  onCopyCredentials: (login: string, password: string) => void;
  onRequestCredentials?: (userId: string) => Promise<string | null>;
  studentDocsByUser: Map<string, string[]>;
}

export const StudentMobileCard = React.memo(function StudentMobileCard({
  student, isSelected, onToggleSelection, onViewStudent, onCopyCredentials, onRequestCredentials, studentDocsByUser,
}: StudentMobileCardProps) {
  const userDocs = studentDocsByUser.get(student.user_id) || [];
  const hasPassport = student.has_passport ?? userDocs.some(t => t === "passport" || t === "birth_certificate");
  const hasSnils = student.has_snils ?? userDocs.includes("snils");
  const hasEducation = student.has_education ?? userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
  const enrollmentsCount = student.enrollments?.length || 0;
  const [loadingPw, setLoadingPw] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!student.login) return;
    if (student.generated_password) {
      onCopyCredentials(student.login, student.generated_password);
      return;
    }
    if (!onRequestCredentials) return;
    setLoadingPw(true);
    try {
      const pw = await onRequestCredentials(student.user_id);
      if (pw) onCopyCredentials(student.login, pw);
    } finally {
      setLoadingPw(false);
    }
  }, [student.login, student.generated_password, student.user_id, onCopyCredentials, onRequestCredentials]);

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
                  {(student.generated_password || onRequestCredentials) && (
                    <button onClick={handleCopy} disabled={loadingPw} className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-50">
                      {loadingPw ? <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
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

