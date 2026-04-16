import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, CheckCircle2, GraduationCap, Search } from "lucide-react";
import { CourseGroupedList } from "./CourseGroupedList";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Course {
  id: string;
  title: string;
  is_published: boolean;
  lessonsCount?: number;
  studentsCount?: number;
  category_id?: string | null;
}

interface CourseCategory {
  id: string;
  name: string;
  color: string;
}

interface EnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  courses: Course[];
  categories: CourseCategory[];
  getCategoryById: (id: string | null | undefined) => CourseCategory | undefined;
  isEnrolling: boolean;
  onEnroll: (courseId: string) => void;
}

export function EnrollDialog({ 
  open, onOpenChange, selectedCount, courses, categories, getCategoryById, isEnrolling, onEnroll 
}: EnrollDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");

  const filteredCourses = courses.filter(
    c => c.is_published && c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) { setSearchQuery(""); setSelectedCourseId(""); }
      onOpenChange(v);
    }}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">Зачислить на курс</DialogTitle>
          <DialogDescription>Выберите курс для зачисления {selectedCount} учеников</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Поиск курса..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
          </div>
          <div className="flex-1 overflow-auto border border-border rounded-xl p-2 space-y-1 min-h-[200px] max-h-[300px]">
            <CourseGroupedList
              courses={filteredCourses}
              getCategoryById={getCategoryById}
              emptyMessage="Курсы не найдены"
              renderCourse={(course) => {
                const isSelected = selectedCourseId === course.id;
                return (
                  <div key={course.id} onClick={() => setSelectedCourseId(course.id)} className={`p-3 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border-2 border-primary' : 'bg-secondary/30 hover:bg-secondary/50 border-2 border-transparent'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{course.title}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{course.lessonsCount} уроков</span><span>•</span><span>{course.studentsCount} учеников</span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-primary" />}
                    </div>
                  </div>
                );
              }}
            />
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={() => onEnroll(selectedCourseId)} disabled={isEnrolling || !selectedCourseId}>
            {isEnrolling ? (<><SigmaSpinner size="sm" className="mr-2" />Зачисление...</>) : (<><GraduationCap className="w-4 h-4 mr-2" />Зачислить на курс</>)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
