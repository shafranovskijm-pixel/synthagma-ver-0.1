import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Search,
  Loader2,
  FileSpreadsheet,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Hash,
  User,
  GraduationCap,
  Award,
  Mail,
  Users,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { format, parseISO, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getXLSX } from "@/utils/xlsxHelper";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EducationDocumentRecord {
  id: string;
  reg_number: string;
  full_name: string;
  birth_date: string;
  document_type: "certificate" | "diploma" | "qualification";
  document_series: string;
  document_number: string;
  issue_date: string;
  specialty_name: string;
  qualification_name: string;
  protocol_number: string;
  protocol_date: string;
  order_number: string;
  order_date: string;
  document_status: "original" | "duplicate";
  original_document_data: string | null;
  delivery_method: "personal" | "representative" | "postal";
  delivery_details: string | null;
  notes: string | null;
  enrollment_id?: string;
}

interface EducationDocumentsJournalProps {
  organizationId: string;
  onClose: () => void;
  documentTypeFilter?: "certificate" | "diploma" | "qualification";
}

interface CompletedStudent {
  enrollment_id: string;
  user_id: string;
  full_name: string;
  birth_date: string | null;
  course_title: string;
  completed_at: string;
  already_added: boolean;
}

const DOCUMENT_TYPES = [
  { value: "certificate", label: "Удостоверение" },
  { value: "diploma", label: "Диплом" },
  { value: "qualification", label: "Свидетельство о квалификации" },
];

const DELIVERY_METHODS = [
  { value: "personal", label: "Лично" },
  { value: "representative", label: "Через представителя" },
  { value: "postal", label: "Почтовое отправление" },
];

export function EducationDocumentsJournal({
  organizationId,
  onClose,
  documentTypeFilter,
}: EducationDocumentsJournalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<EducationDocumentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSelectStudentsDialog, setShowSelectStudentsDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EducationDocumentRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<EducationDocumentRecord | null>(null);

  // Completed students for auto-fill
  const [completedStudents, setCompletedStudents] = useState<CompletedStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    reg_number: "",
    full_name: "",
    birth_date: null as Date | null,
    document_type: "certificate" as "certificate" | "diploma" | "qualification",
    document_series: "",
    document_number: "",
    issue_date: new Date(),
    specialty_name: "",
    qualification_name: "",
    protocol_number: "",
    protocol_date: null as Date | null,
    order_number: "",
    order_date: null as Date | null,
    document_status: "original" as "original" | "duplicate",
    original_document_data: "",
    delivery_method: "personal" as "personal" | "representative" | "postal",
    delivery_details: "",
    notes: "",
    enrollment_id: "",
  });

  // Load records from Supabase
  useEffect(() => {
    const loadRecords = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("education_document_records")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const mappedRecords: EducationDocumentRecord[] = (data || []).map((r) => ({
          id: r.id,
          reg_number: r.reg_number,
          full_name: r.full_name,
          birth_date: r.birth_date || "",
          document_type: r.document_type as "certificate" | "diploma" | "qualification",
          document_series: r.document_series || "",
          document_number: r.document_number,
          issue_date: r.issue_date,
          specialty_name: r.specialty_name,
          qualification_name: r.qualification_name || "",
          protocol_number: r.protocol_number || "",
          protocol_date: r.protocol_date || "",
          order_number: r.order_number || "",
          order_date: r.order_date || "",
          document_status: r.document_status as "original" | "duplicate",
          original_document_data: r.original_document_data,
          delivery_method: r.delivery_method as "personal" | "representative" | "postal",
          delivery_details: r.delivery_details,
          notes: r.notes,
          enrollment_id: r.enrollment_id || undefined,
        }));

        setRecords(mappedRecords);
      } catch (error) {
        console.error("Error loading records:", error);
        toast.error("Ошибка загрузки записей журнала");
      } finally {
        setLoading(false);
      }
    };

    loadRecords();
  }, [organizationId]);

  // Automatically load completed students when journal opens
  useEffect(() => {
    if (!loading) {
      loadCompletedStudents();
    }
  }, [loading, organizationId]);

  // Count of new graduates not yet added
  const newGraduatesCount = useMemo(() => {
    return completedStudents.filter((s) => !s.already_added).length;
  }, [completedStudents]);

  // Auto-add all new graduates
  const handleAutoAddAllGraduates = async () => {
    const newStudents = completedStudents.filter((s) => !s.already_added);
    
    if (newStudents.length === 0) {
      toast.info("Все выпускники уже добавлены в журнал");
      return;
    }

    setSaving(true);
    try {
      const year = new Date().getFullYear();
      let existingCount = records.filter((r) => {
        const issueYear = parseISO(r.issue_date).getFullYear();
        return issueYear === year;
      }).length;

      const recordsToInsert = newStudents.map((student, index) => {
        existingCount += 1;
        const docNumber = `${year}/${(existingCount + index).toString().padStart(6, "0")}`;
        return {
          organization_id: organizationId,
          reg_number: `ДОК-${year}/${existingCount.toString().padStart(4, "0")}`,
          full_name: student.full_name,
          birth_date: student.birth_date || null,
          document_type: documentTypeFilter || "certificate",
          document_series: "",
          document_number: docNumber,
          issue_date: new Date().toISOString().split("T")[0],
          specialty_name: student.course_title,
          qualification_name: "",
          protocol_number: "",
          protocol_date: null,
          order_number: "",
          order_date: null,
          document_status: "original",
          original_document_data: null,
          delivery_method: "personal",
          delivery_details: null,
          notes: null,
          enrollment_id: student.enrollment_id,
        };
      });

      const { data, error } = await supabase
        .from("education_document_records")
        .insert(recordsToInsert)
        .select();

      if (error) throw error;

      const mappedRecords: EducationDocumentRecord[] = (data || []).map((r) => ({
        id: r.id,
        reg_number: r.reg_number,
        full_name: r.full_name,
        birth_date: r.birth_date || "",
        document_type: r.document_type as "certificate" | "diploma" | "qualification",
        document_series: r.document_series || "",
        document_number: r.document_number,
        issue_date: r.issue_date,
        specialty_name: r.specialty_name,
        qualification_name: r.qualification_name || "",
        protocol_number: r.protocol_number || "",
        protocol_date: r.protocol_date || "",
        order_number: r.order_number || "",
        order_date: r.order_date || "",
        document_status: r.document_status as "original" | "duplicate",
        original_document_data: r.original_document_data,
        delivery_method: r.delivery_method as "personal" | "representative" | "postal",
        delivery_details: r.delivery_details,
        notes: r.notes,
        enrollment_id: r.enrollment_id || undefined,
      }));

      setRecords([...mappedRecords, ...records]);
      loadCompletedStudents();
      toast.success(`Автоматически добавлено ${mappedRecords.length} записей`);
    } catch (error) {
      console.error("Error auto-adding graduates:", error);
      toast.error("Ошибка при добавлении записей");
    } finally {
      setSaving(false);
    }
  };

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // Apply document type filter from props first
      if (documentTypeFilter && record.document_type !== documentTypeFilter) {
        return false;
      }

      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        record.full_name.toLowerCase().includes(searchLower) ||
        record.reg_number.toLowerCase().includes(searchLower) ||
        record.document_number.toLowerCase().includes(searchLower) ||
        record.specialty_name.toLowerCase().includes(searchLower);

      const matchesDocType =
        selectedDocType === "all" || record.document_type === selectedDocType;

      const matchesStatus =
        selectedStatus === "all" || record.document_status === selectedStatus;

      const recordDate = parseISO(record.issue_date);
      const matchesDate = isWithinInterval(recordDate, {
        start: dateRange.from,
        end: dateRange.to,
      });

      return matchesSearch && matchesDocType && matchesStatus && matchesDate;
    });
  }, [records, searchQuery, selectedDocType, selectedStatus, dateRange, documentTypeFilter]);

  // Statistics
  const stats = useMemo(() => {
    const certificates = filteredRecords.filter((r) => r.document_type === "certificate").length;
    const diplomas = filteredRecords.filter((r) => r.document_type === "diploma").length;
    const originals = filteredRecords.filter((r) => r.document_status === "original").length;
    const duplicates = filteredRecords.filter((r) => r.document_status === "duplicate").length;
    return { total: filteredRecords.length, certificates, diplomas, originals, duplicates };
  }, [filteredRecords]);

  // Get title based on document type filter
  const getJournalTitle = () => {
    if (documentTypeFilter === "certificate") return "Журнал регистрации удостоверений";
    if (documentTypeFilter === "diploma") return "Журнал регистрации дипломов";
    if (documentTypeFilter === "qualification") return "Журнал регистрации свидетельств";
    return "Журнал регистрации документов об образовании";
  };

  const getJournalSubtitle = () => {
    if (documentTypeFilter === "certificate") return "Учёт выданных удостоверений о повышении квалификации";
    if (documentTypeFilter === "diploma") return "Учёт выданных дипломов о профессиональной переподготовке";
    if (documentTypeFilter === "qualification") return "Учёт выданных свидетельств о профессии/квалификации";
    return "Учёт выданных удостоверений, дипломов и свидетельств о квалификации";
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      reg_number: "",
      full_name: "",
      birth_date: null,
      document_type: documentTypeFilter || "certificate",
      document_series: "",
      document_number: "",
      issue_date: new Date(),
      specialty_name: "",
      qualification_name: "",
      protocol_number: "",
      protocol_date: null,
      order_number: "",
      order_date: null,
      document_status: "original",
      original_document_data: "",
      delivery_method: "personal",
      delivery_details: "",
      notes: "",
      enrollment_id: "",
    });
  };

  // Generate registration number
  const generateRegNumber = () => {
    const year = formData.issue_date.getFullYear();
    const sameYearCount = records.filter((r) => {
      const rYear = parseISO(r.issue_date).getFullYear();
      return rYear === year;
    }).length;
    const suggestedNumber = `ДОК-${year}/${(sameYearCount + 1).toString().padStart(4, "0")}`;
    setFormData((prev) => ({ ...prev, reg_number: suggestedNumber }));
  };

  // Open add dialog
  const handleOpenAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  // Open edit dialog
  const handleOpenEdit = (record: EducationDocumentRecord) => {
    setFormData({
      reg_number: record.reg_number,
      full_name: record.full_name,
      birth_date: record.birth_date ? parseISO(record.birth_date) : null,
      document_type: record.document_type,
      document_series: record.document_series,
      document_number: record.document_number,
      issue_date: parseISO(record.issue_date),
      specialty_name: record.specialty_name,
      qualification_name: record.qualification_name,
      protocol_number: record.protocol_number,
      protocol_date: record.protocol_date ? parseISO(record.protocol_date) : null,
      order_number: record.order_number,
      order_date: record.order_date ? parseISO(record.order_date) : null,
      document_status: record.document_status,
      original_document_data: record.original_document_data || "",
      delivery_method: record.delivery_method,
      delivery_details: record.delivery_details || "",
      notes: record.notes || "",
      enrollment_id: record.enrollment_id || "",
    });
    setEditingRecord(record);
  };

  // Load completed students for auto-fill
  const loadCompletedStudents = async () => {
    setLoadingStudents(true);
    try {
      // Get courses for this organization
      const { data: courses, error: coursesError } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", organizationId);

      if (coursesError) throw coursesError;

      if (!courses || courses.length === 0) {
        setCompletedStudents([]);
        return;
      }

      const courseIds = courses.map((c) => c.id);
      const courseMap = new Map(courses.map((c) => [c.id, c.title]));

      // Get completed enrollments
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select("id, user_id, course_id, completed_at")
        .in("course_id", courseIds)
        .eq("status", "completed")
        .not("completed_at", "is", null);

      if (enrollmentsError) throw enrollmentsError;

      if (!enrollments || enrollments.length === 0) {
        setCompletedStudents([]);
        return;
      }

      const userIds = [...new Set(enrollments.map((e) => e.user_id))];

      // Get profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      // Get FRDO data for birth dates
      const { data: frdoData, error: frdoError } = await supabase
        .from("student_frdo_data")
        .select("user_id, birth_date")
        .in("user_id", userIds);

      if (frdoError) throw frdoError;

      const profileMap = new Map(
        profiles?.map((p) => [p.user_id, p]) || []
      );
      const frdoMap = new Map(
        frdoData?.map((f) => [f.user_id, f.birth_date]) || []
      );

      // Check which enrollments already have records
      const addedEnrollmentIds = new Set(
        records
          .filter((r) => r.enrollment_id)
          .map((r) => r.enrollment_id)
      );

      const students: CompletedStudent[] = enrollments.map((enrollment) => {
        const profile = profileMap.get(enrollment.user_id);
        const birthDate = frdoMap.get(enrollment.user_id);

        return {
          enrollment_id: enrollment.id,
          user_id: enrollment.user_id,
          full_name: profile?.full_name || profile?.email || "Неизвестный студент",
          birth_date: birthDate || null,
          course_title: courseMap.get(enrollment.course_id) || "Неизвестный курс",
          completed_at: enrollment.completed_at!,
          already_added: addedEnrollmentIds.has(enrollment.id),
        };
      });

      // Sort by completed_at desc
      students.sort((a, b) => 
        new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
      );

      setCompletedStudents(students);
    } catch (error) {
      console.error("Error loading completed students:", error);
      toast.error("Ошибка загрузки списка выпускников");
    } finally {
      setLoadingStudents(false);
    }
  };

  // Open select students dialog
  const handleOpenSelectStudents = async () => {
    setSelectedStudents(new Set());
    setStudentSearchQuery("");
    setShowSelectStudentsDialog(true);
    await loadCompletedStudents();
  };

  // Generate document number based on existing records
  const generateDocumentNumber = (index: number) => {
    const year = new Date().getFullYear();
    const existingCount = records.filter((r) => {
      const issueYear = parseISO(r.issue_date).getFullYear();
      return issueYear === year;
    }).length;
    return `${year}/${(existingCount + index + 1).toString().padStart(6, "0")}`;
  };

  // Create records for selected students
  const handleCreateFromStudents = async () => {
    const selectedList = completedStudents.filter(
      (s) => selectedStudents.has(s.enrollment_id) && !s.already_added
    );

    if (selectedList.length === 0) {
      toast.error("Выберите хотя бы одного выпускника");
      return;
    }

    setSaving(true);
    try {
      const year = new Date().getFullYear();
      let existingCount = records.filter((r) => {
        const issueYear = parseISO(r.issue_date).getFullYear();
        return issueYear === year;
      }).length;

      const recordsToInsert = selectedList.map((student, index) => {
        existingCount += 1;
        return {
          organization_id: organizationId,
          reg_number: `ДОК-${year}/${existingCount.toString().padStart(4, "0")}`,
          full_name: student.full_name,
          birth_date: student.birth_date || null,
          document_type: documentTypeFilter || "certificate",
          document_series: "",
          document_number: generateDocumentNumber(index),
          issue_date: new Date().toISOString().split("T")[0],
          specialty_name: student.course_title,
          qualification_name: "",
          protocol_number: "",
          protocol_date: null,
          order_number: "",
          order_date: null,
          document_status: "original",
          original_document_data: null,
          delivery_method: "personal",
          delivery_details: null,
          notes: null,
          enrollment_id: student.enrollment_id,
        };
      });

      const { data, error } = await supabase
        .from("education_document_records")
        .insert(recordsToInsert)
        .select();

      if (error) throw error;

      const mappedRecords: EducationDocumentRecord[] = (data || []).map((r) => ({
        id: r.id,
        reg_number: r.reg_number,
        full_name: r.full_name,
        birth_date: r.birth_date || "",
        document_type: r.document_type as "certificate" | "diploma" | "qualification",
        document_series: r.document_series || "",
        document_number: r.document_number,
        issue_date: r.issue_date,
        specialty_name: r.specialty_name,
        qualification_name: r.qualification_name || "",
        protocol_number: r.protocol_number || "",
        protocol_date: r.protocol_date || "",
        order_number: r.order_number || "",
        order_date: r.order_date || "",
        document_status: r.document_status as "original" | "duplicate",
        original_document_data: r.original_document_data,
        delivery_method: r.delivery_method as "personal" | "representative" | "postal",
        delivery_details: r.delivery_details,
        notes: r.notes,
        enrollment_id: r.enrollment_id || undefined,
      }));

      setRecords([...mappedRecords, ...records]);
      setShowSelectStudentsDialog(false);
      loadCompletedStudents();
      toast.success(`Создано ${mappedRecords.length} записей`);
    } catch (error) {
      console.error("Error creating records from students:", error);
      toast.error("Ошибка при создании записей");
    } finally {
      setSaving(false);
    }
  };

  // Filter completed students by search
  const filteredStudents = useMemo(() => {
    if (!studentSearchQuery) return completedStudents;
    const query = studentSearchQuery.toLowerCase();
    return completedStudents.filter(
      (s) =>
        s.full_name.toLowerCase().includes(query) ||
        s.course_title.toLowerCase().includes(query)
    );
  }, [completedStudents, studentSearchQuery]);

  // Toggle student selection
  const toggleStudentSelection = (enrollmentId: string) => {
    const newSet = new Set(selectedStudents);
    if (newSet.has(enrollmentId)) {
      newSet.delete(enrollmentId);
    } else {
      newSet.add(enrollmentId);
    }
    setSelectedStudents(newSet);
  };

  // Select all students
  const selectAllStudents = () => {
    const available = filteredStudents.filter((s) => !s.already_added);
    if (selectedStudents.size === available.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(available.map((s) => s.enrollment_id)));
    }
  };

  // Save record
  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      toast.error("Введите ФИО выпускника");
      return;
    }
    if (!formData.reg_number.trim()) {
      toast.error("Введите регистрационный номер");
      return;
    }
    if (!formData.document_number.trim()) {
      toast.error("Введите номер документа");
      return;
    }
    if (!formData.specialty_name.trim()) {
      toast.error("Введите наименование специальности");
      return;
    }

    setSaving(true);

    try {
      const dbRecord = {
        organization_id: organizationId,
        reg_number: formData.reg_number.trim(),
        full_name: formData.full_name.trim(),
        birth_date: formData.birth_date?.toISOString().split("T")[0] || null,
        document_type: formData.document_type,
        document_series: formData.document_series.trim() || null,
        document_number: formData.document_number.trim(),
        issue_date: formData.issue_date.toISOString().split("T")[0],
        specialty_name: formData.specialty_name.trim(),
        qualification_name: formData.qualification_name.trim() || null,
        protocol_number: formData.protocol_number.trim() || null,
        protocol_date: formData.protocol_date?.toISOString().split("T")[0] || null,
        order_number: formData.order_number.trim() || null,
        order_date: formData.order_date?.toISOString().split("T")[0] || null,
        document_status: formData.document_status,
        original_document_data: formData.document_status === "duplicate" ? formData.original_document_data.trim() : null,
        delivery_method: formData.delivery_method,
        delivery_details: formData.delivery_method !== "personal" ? formData.delivery_details.trim() : null,
        notes: formData.notes.trim() || null,
        enrollment_id: formData.enrollment_id || null,
      };

      if (editingRecord) {
        const { data, error } = await supabase
          .from("education_document_records")
          .update(dbRecord)
          .eq("id", editingRecord.id)
          .select()
          .single();

        if (error) throw error;

        const updatedRecord: EducationDocumentRecord = {
          id: data.id,
          reg_number: data.reg_number,
          full_name: data.full_name,
          birth_date: data.birth_date || "",
          document_type: data.document_type as "certificate" | "diploma" | "qualification",
          document_series: data.document_series || "",
          document_number: data.document_number,
          issue_date: data.issue_date,
          specialty_name: data.specialty_name,
          qualification_name: data.qualification_name || "",
          protocol_number: data.protocol_number || "",
          protocol_date: data.protocol_date || "",
          order_number: data.order_number || "",
          order_date: data.order_date || "",
          document_status: data.document_status as "original" | "duplicate",
          original_document_data: data.original_document_data,
          delivery_method: data.delivery_method as "personal" | "representative" | "postal",
          delivery_details: data.delivery_details,
          notes: data.notes,
          enrollment_id: data.enrollment_id || undefined,
        };

        setRecords(records.map((r) => r.id === editingRecord.id ? updatedRecord : r));
        toast.success("Запись обновлена");
      } else {
        const { data, error } = await supabase
          .from("education_document_records")
          .insert(dbRecord)
          .select()
          .single();

        if (error) throw error;

        const newRecord: EducationDocumentRecord = {
          id: data.id,
          reg_number: data.reg_number,
          full_name: data.full_name,
          birth_date: data.birth_date || "",
          document_type: data.document_type as "certificate" | "diploma" | "qualification",
          document_series: data.document_series || "",
          document_number: data.document_number,
          issue_date: data.issue_date,
          specialty_name: data.specialty_name,
          qualification_name: data.qualification_name || "",
          protocol_number: data.protocol_number || "",
          protocol_date: data.protocol_date || "",
          order_number: data.order_number || "",
          order_date: data.order_date || "",
          document_status: data.document_status as "original" | "duplicate",
          original_document_data: data.original_document_data,
          delivery_method: data.delivery_method as "personal" | "representative" | "postal",
          delivery_details: data.delivery_details,
          notes: data.notes,
          enrollment_id: data.enrollment_id || undefined,
        };

        setRecords([newRecord, ...records]);
        toast.success("Запись добавлена");
      }

      setShowAddDialog(false);
      setEditingRecord(null);
      resetForm();
    } catch (error) {
      console.error("Error saving record:", error);
      toast.error("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  // Delete record
  const handleDelete = async () => {
    if (!deletingRecord) return;

    try {
      const { error } = await supabase
        .from("education_document_records")
        .delete()
        .eq("id", deletingRecord.id);

      if (error) throw error;

      setRecords(records.filter((r) => r.id !== deletingRecord.id));
      toast.success("Запись удалена");
      setDeletingRecord(null);
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error("Ошибка при удалении");
    }
  };

  // Export to Excel
  const exportToExcel = async () => {
    if (filteredRecords.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }

    const XLSX = await getXLSX();
    const exportData = filteredRecords.map((record, index) => ({
      "№ п/п": index + 1,
      "Рег. номер": record.reg_number,
      "ФИО выпускника": record.full_name,
      "Дата рождения": record.birth_date ? format(parseISO(record.birth_date), "dd.MM.yyyy", { locale: ru }) : "—",
      "Тип документа": DOCUMENT_TYPES.find((t) => t.value === record.document_type)?.label || "",
      "Серия": record.document_series || "—",
      "Номер": record.document_number,
      "Дата выдачи": format(parseISO(record.issue_date), "dd.MM.yyyy", { locale: ru }),
      "Специальность/направление": record.specialty_name,
      "Квалификация": record.qualification_name || "—",
      "№ протокола ГЭК": record.protocol_number || "—",
      "Дата протокола": record.protocol_date ? format(parseISO(record.protocol_date), "dd.MM.yyyy", { locale: ru }) : "—",
      "№ приказа об отчислении": record.order_number || "—",
      "Дата приказа": record.order_date ? format(parseISO(record.order_date), "dd.MM.yyyy", { locale: ru }) : "—",
      "Статус": record.document_status === "original" ? "Оригинал" : "Дубликат",
      "Данные оригинала (для дубликата)": record.original_document_data || "—",
      "Способ получения": DELIVERY_METHODS.find((m) => m.value === record.delivery_method)?.label || "",
      "Детали получения": record.delivery_details || "—",
      "Примечания": record.notes || "—",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Документы об образовании");

    const columnWidths = [
      { wch: 8 }, { wch: 18 }, { wch: 35 }, { wch: 14 }, { wch: 25 },
      { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 40 }, { wch: 25 },
      { wch: 15 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
      { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 30 },
    ];
    worksheet["!cols"] = columnWidths;

    const fileName = `Журнал_документов_об_образовании_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success("Журнал экспортирован в Excel");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {!documentTypeFilter && (
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h2 className="text-xl font-semibold">{getJournalTitle()}</h2>
            <p className="text-sm text-muted-foreground">
              {getJournalSubtitle()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="default" 
            onClick={handleOpenSelectStudents} 
            className="rounded-xl bg-gradient-to-r from-primary to-primary/80"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Из выпускников
          </Button>
          <Button variant="outline" onClick={handleOpenAdd} className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            Добавить вручную
          </Button>
          <Button variant="outline" onClick={exportToExcel} className="rounded-xl">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Всего записей</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.certificates}</p>
              <p className="text-xs text-muted-foreground">Удостоверений</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.diplomas}</p>
              <p className="text-xs text-muted-foreground">Дипломов</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.duplicates}</p>
              <p className="text-xs text-muted-foreground">Дубликатов</p>
            </div>
          </div>
        </div>
      </div>

      {/* New Graduates Banner */}
      {!loadingStudents && newGraduatesCount > 0 && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Новые выпускники: {newGraduatesCount}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Найдены студенты, завершившие обучение. Добавить их в журнал автоматически?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenSelectStudents}
                className="rounded-xl"
              >
                Выбрать
              </Button>
              <Button
                size="sm"
                onClick={handleAutoAddAllGraduates}
                className="rounded-xl"
              >
                <Plus className="w-4 h-4 mr-1" />
                Добавить всех
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по ФИО, номеру документа..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          <Select value={selectedDocType} onValueChange={setSelectedDocType}>
            <SelectTrigger className="w-[200px] rounded-xl">
              <SelectValue placeholder="Тип документа" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[160px] rounded-xl">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="original">Оригиналы</SelectItem>
              <SelectItem value="duplicate">Дубликаты</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(dateRange.from, "dd.MM.yy")} - {format(dateRange.to, "dd.MM.yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  }
                }}
                locale={ru}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Table */}
      {filteredRecords.length > 0 ? (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">№</TableHead>
                  <TableHead className="w-32">Рег. номер</TableHead>
                  <TableHead>ФИО выпускника</TableHead>
                  <TableHead>Документ</TableHead>
                  <TableHead>Специальность</TableHead>
                  <TableHead className="text-center">Дата выдачи</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record, index) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-center text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded font-mono">
                        {record.reg_number}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{record.full_name}</div>
                        {record.birth_date && (
                          <div className="text-xs text-muted-foreground">
                            Дата рождения: {format(parseISO(record.birth_date), "dd.MM.yyyy")}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge variant="secondary" className="rounded mb-1">
                          {DOCUMENT_TYPES.find((t) => t.value === record.document_type)?.label}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {record.document_series && `Серия: ${record.document_series}, `}
                          № {record.document_number}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <div className="text-sm truncate">{record.specialty_name}</div>
                        {record.qualification_name && (
                          <div className="text-xs text-muted-foreground truncate">
                            {record.qualification_name}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {format(parseISO(record.issue_date), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded",
                          record.document_status === "original"
                            ? "bg-green-500/10 text-green-600 border-green-500/30"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        )}
                      >
                        {record.document_status === "original" ? "Оригинал" : "Дубликат"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-lg h-8 w-8"
                          onClick={() => handleOpenEdit(record)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-lg h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingRecord(record)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-12">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">Записей не найдено</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery || selectedDocType !== "all" || selectedStatus !== "all"
                ? "Попробуйте изменить параметры поиска"
                : "Добавьте первую запись в журнал"}
            </p>
            {!searchQuery && selectedDocType === "all" && selectedStatus === "all" && (
              <Button onClick={handleOpenAdd} className="rounded-xl">
                <Plus className="w-4 h-4 mr-2" />
                Добавить запись
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog
        open={showAddDialog || !!editingRecord}
        onOpenChange={() => {
          setShowAddDialog(false);
          setEditingRecord(null);
          resetForm();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? "Редактирование записи" : "Добавление записи в журнал"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Registration Number */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Регистрационный номер *</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.reg_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, reg_number: e.target.value }))
                    }
                    placeholder="ДОК-2025/0001"
                    className="rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateRegNumber}
                    className="rounded-xl shrink-0"
                  >
                    <Hash className="w-4 h-4 mr-1" />
                    Генерировать
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Дата выдачи документа *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal rounded-xl",
                        !formData.issue_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.issue_date
                        ? format(formData.issue_date, "dd MMMM yyyy", { locale: ru })
                        : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.issue_date}
                      onSelect={(date) =>
                        setFormData((prev) => ({ ...prev, issue_date: date || new Date() }))
                      }
                      locale={ru}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Graduate Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Данные выпускника
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ФИО выпускника (как в паспорте) *</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, full_name: e.target.value }))
                    }
                    placeholder="Иванов Иван Иванович"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата рождения</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal rounded-xl",
                          !formData.birth_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.birth_date
                          ? format(formData.birth_date, "dd MMMM yyyy", { locale: ru })
                          : "Выберите дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.birth_date || undefined}
                        onSelect={(date) =>
                          setFormData((prev) => ({ ...prev, birth_date: date || null }))
                        }
                        locale={ru}
                        captionLayout="dropdown-buttons"
                        fromYear={1940}
                        toYear={new Date().getFullYear()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Document Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Award className="w-4 h-4" />
                Данные документа
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Тип документа *</Label>
                  <Select
                    value={formData.document_type}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        document_type: value as "certificate" | "diploma" | "qualification",
                      }))
                    }
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Серия документа</Label>
                  <Input
                    value={formData.document_series}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, document_series: e.target.value }))
                    }
                    placeholder="ПП"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Номер документа *</Label>
                  <Input
                    value={formData.document_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, document_number: e.target.value }))
                    }
                    placeholder="0000001"
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Education Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <GraduationCap className="w-4 h-4" />
                Сведения об образовании
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Наименование специальности / направления подготовки / профессии *</Label>
                  <Textarea
                    value={formData.specialty_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, specialty_name: e.target.value }))
                    }
                    placeholder="Охрана труда"
                    className="rounded-xl min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Присвоенная квалификация</Label>
                  <Textarea
                    value={formData.qualification_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, qualification_name: e.target.value }))
                    }
                    placeholder="Специалист по охране труда"
                    className="rounded-xl min-h-[80px]"
                  />
                </div>
              </div>
            </div>

            {/* Protocol and Order Info */}
            <div className="space-y-4">
              <h4 className="font-medium">Основания выдачи</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Номер протокола ГЭК</Label>
                  <Input
                    value={formData.protocol_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, protocol_number: e.target.value }))
                    }
                    placeholder="1"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата протокола ГЭК</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal rounded-xl",
                          !formData.protocol_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.protocol_date
                          ? format(formData.protocol_date, "dd MMMM yyyy", { locale: ru })
                          : "Выберите дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.protocol_date || undefined}
                        onSelect={(date) =>
                          setFormData((prev) => ({ ...prev, protocol_date: date || null }))
                        }
                        locale={ru}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Номер приказа об отчислении</Label>
                  <Input
                    value={formData.order_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, order_number: e.target.value }))
                    }
                    placeholder="12-ОТ"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата приказа</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal rounded-xl",
                          !formData.order_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.order_date
                          ? format(formData.order_date, "dd MMMM yyyy", { locale: ru })
                          : "Выберите дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.order_date || undefined}
                        onSelect={(date) =>
                          setFormData((prev) => ({ ...prev, order_date: date || null }))
                        }
                        locale={ru}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Document Status */}
            <div className="space-y-4">
              <h4 className="font-medium">Статус документа</h4>
              <RadioGroup
                value={formData.document_status}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    document_status: value as "original" | "duplicate",
                  }))
                }
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="original" id="original" />
                  <Label htmlFor="original" className="cursor-pointer">
                    Оригинал
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="duplicate" id="duplicate" />
                  <Label htmlFor="duplicate" className="cursor-pointer">
                    Дубликат
                  </Label>
                </div>
              </RadioGroup>

              {formData.document_status === "duplicate" && (
                <div className="space-y-2">
                  <Label>Данные заменяемого оригинала</Label>
                  <Textarea
                    value={formData.original_document_data}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        original_document_data: e.target.value,
                      }))
                    }
                    placeholder="Серия ПП № 0000001 от 01.01.2024, причина замены: утеря"
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Delivery Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Сведения о получении
              </h4>
              <div className="space-y-2">
                <Label>Способ получения</Label>
                <Select
                  value={formData.delivery_method}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      delivery_method: value as "personal" | "representative" | "postal",
                    }))
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.delivery_method !== "personal" && (
                <div className="space-y-2">
                  <Label>
                    {formData.delivery_method === "representative"
                      ? "Данные представителя (ФИО, доверенность)"
                      : "Номер почтового отправления"}
                  </Label>
                  <Input
                    value={formData.delivery_details}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, delivery_details: e.target.value }))
                    }
                    placeholder={
                      formData.delivery_method === "representative"
                        ? "Петров П.П., доверенность № 1 от 01.01.2025"
                        : "80123456789012"
                    }
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Примечания</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Дополнительные сведения..."
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setEditingRecord(null);
                resetForm();
              }}
              className="rounded-xl"
            >
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRecord ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingRecord} onOpenChange={() => setDeletingRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить запись для{" "}
              <strong>{deletingRecord?.full_name}</strong> (рег. номер:{" "}
              {deletingRecord?.reg_number})? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Select Students Dialog */}
      <Dialog open={showSelectStudentsDialog} onOpenChange={setShowSelectStudentsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Создание записей из данных выпускников
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по ФИО или курсу..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>

            {/* Info */}
            <div className="bg-muted/50 rounded-xl p-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 mt-0.5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Автоматическое заполнение</p>
                  <p>ФИО, дата рождения и наименование курса будут заполнены автоматически. 
                  Остальные поля (номер протокола ГЭК, приказа и др.) можно будет добавить после создания записи.</p>
                </div>
              </div>
            </div>

            {loadingStudents ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : completedStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <GraduationCap className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg">Нет завершивших обучение</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Завершившие студенты появятся здесь после того, как их статус обучения будет изменён на "Завершено"
                </p>
              </div>
            ) : (
              <>
                {/* Select All */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={
                        filteredStudents.filter((s) => !s.already_added).length > 0 &&
                        selectedStudents.size === filteredStudents.filter((s) => !s.already_added).length
                      }
                      onCheckedChange={selectAllStudents}
                    />
                    <Label htmlFor="select-all" className="text-sm cursor-pointer">
                      Выбрать всех ({filteredStudents.filter((s) => !s.already_added).length})
                    </Label>
                  </div>
                  {selectedStudents.size > 0 && (
                    <Badge variant="secondary" className="rounded-full">
                      Выбрано: {selectedStudents.size}
                    </Badge>
                  )}
                </div>

                {/* Students List */}
                <ScrollArea className="h-[300px] rounded-xl border">
                  <div className="divide-y">
                    {filteredStudents.map((student) => (
                      <div
                        key={student.enrollment_id}
                        className={cn(
                          "flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors",
                          student.already_added && "opacity-50"
                        )}
                      >
                        <Checkbox
                          id={student.enrollment_id}
                          checked={selectedStudents.has(student.enrollment_id)}
                          onCheckedChange={() => toggleStudentSelection(student.enrollment_id)}
                          disabled={student.already_added}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{student.full_name}</span>
                            {student.already_added && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Добавлен
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {student.course_title}
                          </div>
                          <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                            {student.birth_date && (
                              <span>Дата рождения: {format(parseISO(student.birth_date), "dd.MM.yyyy")}</span>
                            )}
                            <span>
                              Завершил: {format(parseISO(student.completed_at), "dd.MM.yyyy")}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowSelectStudentsDialog(false)}
              className="rounded-xl"
            >
              Отмена
            </Button>
            <Button
              onClick={handleCreateFromStudents}
              disabled={selectedStudents.size === 0}
              className="rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              Создать записи ({selectedStudents.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
