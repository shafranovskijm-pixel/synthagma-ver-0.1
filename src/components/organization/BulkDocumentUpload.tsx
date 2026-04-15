import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Users,
  Award,
  FileCheck,
  File,
  GraduationCap,
  CheckCircle2,
  Search,
  Filter } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Student {
  id: string;
  user_id: string;
  enrollment_id: string;
  name: string;
  email: string;
  course_id: string;
  course_name: string;
}

interface Course {
  id: string;
  title: string;
}

const DOCUMENT_TYPES = [
  { value: "certificate", label: "Сертификат", icon: Award },
  { value: "diploma", label: "Диплом", icon: GraduationCap },
  { value: "agreement", label: "Соглашение", icon: FileCheck },
  { value: "assignment", label: "Задание", icon: FileText },
  { value: "other", label: "Прочее", icon: File },
];

interface BulkDocumentUploadProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function BulkDocumentUpload({
  organizationId,
  isOpen,
  onClose }: BulkDocumentUploadProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Selection state
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("certificate");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchStudents();
    }
  }, [isOpen, organizationId]);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      // Fetch courses
      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", organizationId)
        .eq("is_published", true);

      setCourses(coursesData || []);

      // Fetch enrollments with student info
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select(`
          id,
          user_id,
          course_id,
          courses!inner(id, title, organization_id)
        `)
        .eq("courses.organization_id", organizationId);

      if (!enrollments) {
        setStudents([]);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(enrollments.map((e) => e.user_id))];

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      // Build student list
      const studentList: Student[] = enrollments.map((e) => {
        const profile = profileMap.get(e.user_id);
        const course = e.courses as unknown as { id: string; title: string };
        return {
          id: e.id,
          user_id: e.user_id,
          enrollment_id: e.id,
          name: profile?.full_name || "Без имени",
          email: profile?.email || "",
          course_id: course.id,
          course_name: course.title };
      });

      setStudents(studentList);
    } catch (error) {
      console.error("Error fetching students:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docName) {
        setDocName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const toggleStudent = (enrollmentId: string) => {
    const newSet = new Set(selectedStudentIds);
    if (newSet.has(enrollmentId)) {
      newSet.delete(enrollmentId);
    } else {
      newSet.add(enrollmentId);
    }
    setSelectedStudentIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === filteredStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map((s) => s.enrollment_id)));
    }
  };

  const handleBulkUpload = async () => {
    if (!docName.trim()) {
      toast.error("Введите название документа");
      return;
    }

    if (selectedStudentIds.size === 0) {
      toast.error("Выберите учеников");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const selectedEnrollments = Array.from(selectedStudentIds);
      let completedCount = 0;

      for (const enrollmentId of selectedEnrollments) {
        let fileUrl: string | null = null;

        if (selectedFile) {
          const fileExt = selectedFile.name.split(".").pop();
          const fileName = `students/${enrollmentId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from("student-documents")
            .upload(fileName, selectedFile);

          if (!uploadError) {
            fileUrl = fileName;
          }
        }

        const { error } = await supabase.from("student_documents").insert({
          enrollment_id: enrollmentId,
          name: docName.trim(),
          type: docType,
          file_url: fileUrl });

        if (error) {
          console.error(`Error uploading to ${enrollmentId}:`, error);
        }

        completedCount++;
        setUploadProgress(Math.round((completedCount / selectedEnrollments.length) * 100));
      }

      toast.success(`Документ добавлен ${completedCount} ученикам`);
      resetForm();
      onClose();
    } catch (error) {
      console.error("Error bulk uploading:", error);
      toast.error("Ошибка загрузки документов");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const resetForm = () => {
    setDocName("");
    setDocType("certificate");
    setSelectedFile(null);
    setSelectedStudentIds(new Set());
    setCourseFilter("all");
    setSearchQuery("");
  };

  const filteredStudents = students.filter((s) => {
    const matchesCourse = courseFilter === "all" || s.course_id === courseFilter;
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCourse && matchesSearch;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl rounded-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Массовая загрузка документов
          </DialogTitle>
          <DialogDescription>
            Загрузите один документ сразу нескольким ученикам
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner size="lg" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Document Info */}
            <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
              <h3 className="font-semibold">Документ</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Название *</Label>
                  <Input
                    placeholder="Введите название"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Тип документа</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="w-4 h-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Файл</Label>
                <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="bulk-doc-upload"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <label htmlFor="bulk-doc-upload" className="cursor-pointer">
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2 text-primary">
                        <FileText className="w-5 h-5" />
                        <span className="font-medium">{selectedFile.name}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
                        <div className="text-sm text-muted-foreground">
                          Нажмите для выбора файла
                        </div>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            </div>

            {/* Student Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  Выберите учеников ({selectedStudentIds.size} выбрано)
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="rounded-lg"
                >
                  {selectedStudentIds.size === filteredStudents.length
                    ? "Снять выделение"
                    : "Выбрать всех"}
                </Button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по имени или email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 rounded-xl"
                  />
                </div>
                <Select value={courseFilter} onValueChange={setCourseFilter}>
                  <SelectTrigger className="w-60 rounded-xl">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Фильтр по курсу" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все курсы</SelectItem>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Student List */}
              <div className="border border-border rounded-xl max-h-60 overflow-auto">
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Ученики не найдены</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredStudents.map((student) => (
                      <label
                        key={student.enrollment_id}
                        className="flex items-center gap-4 p-3 hover:bg-secondary/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedStudentIds.has(student.enrollment_id)}
                          onCheckedChange={() => toggleStudent(student.enrollment_id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{student.name}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {student.email}
                          </div>
                        </div>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg truncate max-w-40">
                          {student.course_name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Загрузка...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose} className="rounded-xl">
                Отмена
              </Button>
              <Button
                className="btn-gradient rounded-xl gap-2"
                onClick={handleBulkUpload}
                disabled={isUploading || !docName.trim() || selectedStudentIds.size === 0}
              >
                {isUploading ? (
                  <>
                    <SigmaSpinner size="sm" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Загрузить ({selectedStudentIds.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
