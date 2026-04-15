import React from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Users, Plus, Search, UserPlus, RotateCcw } from "lucide-react";

interface Student {
  id: string;
  user_id: string;
  enrollment_id: string | null;
  name: string;
  email: string;
  progress: number;
  status: string | null;
}

interface AvailableStudent {
  id: string;
  user_id: string;
  name: string;
  email: string;
}

interface CourseStudentsTabProps {
  courseStudents: Student[];
  enrollPopoverOpen: boolean;
  setEnrollPopoverOpen: (v: boolean) => void;
  isLoadingAvailable: boolean;
  filteredAvailableStudents: AvailableStudent[];
  availableStudents: AvailableStudent[];
  enrollSearchQuery: string;
  setEnrollSearchQuery: (v: string) => void;
  selectedToEnroll: Set<string>;
  toggleStudentToEnroll: (userId: string) => void;
  isEnrolling: boolean;
  onEnrollSelected: () => void;
  onResetConfirm: (student: Student) => void;
}

export function CourseStudentsTab({
  courseStudents, enrollPopoverOpen, setEnrollPopoverOpen,
  isLoadingAvailable, filteredAvailableStudents, availableStudents,
  enrollSearchQuery, setEnrollSearchQuery,
  selectedToEnroll, toggleStudentToEnroll,
  isEnrolling, onEnrollSelected, onResetConfirm,
}: CourseStudentsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Ученики курса</h3>
        <Popover open={enrollPopoverOpen} onOpenChange={setEnrollPopoverOpen}>
          <PopoverTrigger asChild>
            <Button className="btn-gradient rounded-xl gap-2"><Plus className="w-4 h-4" />Зачислить ученика</Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Поиск учеников..." value={enrollSearchQuery} onChange={(e) => setEnrollSearchQuery(e.target.value)} className="pl-9 rounded-lg" />
              </div>
            </div>
            <ScrollArea className="h-64">
              {isLoadingAvailable ? (
                <div className="flex items-center justify-center py-8"><SigmaSpinner /></div>
              ) : filteredAvailableStudents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {availableStudents.length === 0 ? "Нет доступных учеников для зачисления" : "Ученики не найдены"}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredAvailableStudents.map(student => (
                    <div key={student.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors" onClick={() => toggleStudentToEnroll(student.user_id)}>
                      <Checkbox checked={selectedToEnroll.has(student.user_id)} onCheckedChange={() => toggleStudentToEnroll(student.user_id)} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{student.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{student.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            {selectedToEnroll.size > 0 && (
              <div className="p-3 border-t border-border">
                <Button className="w-full btn-gradient rounded-lg gap-2" onClick={onEnrollSelected} disabled={isEnrolling}>
                  {isEnrolling ? <><SigmaSpinner size="sm" />Зачисление...</> : <><UserPlus className="w-4 h-4" />Зачислить ({selectedToEnroll.size})</>}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {courseStudents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Нет зачисленных учеников</p></div>
      ) : (
        <div className="space-y-2">
          {courseStudents.map(student => (
            <div key={student.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
              <div><div className="font-medium">{student.name}</div><div className="text-sm text-muted-foreground">{student.email}</div></div>
              <div className="flex items-center gap-4">
                <div className="text-right"><div className="text-sm font-medium">{Math.min(student.progress, 100)}%</div><Progress value={Math.min(student.progress, 100)} className="w-24 h-2" /></div>
                <span className={`px-2 py-1 rounded-full text-xs ${student.status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : 'bg-primary/10 text-primary'}`}>
                  {student.status === 'completed' ? 'Завершил' : 'Активный'}
                </span>
                {student.progress > 0 && student.enrollment_id && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onResetConfirm(student)} title="Сбросить прогресс">
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
