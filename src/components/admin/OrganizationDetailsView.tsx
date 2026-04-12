import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  BookOpen,
  FileText,
  Settings,
  BarChart3,
  HardDrive,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Search,
  Building2,
  Save,
  TrendingUp,
  AlertTriangle,
  Bell,
  MessageSquare,
  ShieldOff,
  Puzzle,
  History,
  Wallet,
  Eye,
  EyeOff,
  ExternalLink,
  Calendar,
  Copy,
  KeyRound,
  Download,
  Trash2,
  RefreshCw,
  CreditCard,
  Image,
  Upload,
} from "lucide-react";
import { safeInvoke } from "@/utils/safeInvoke";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { OrgDocumentsTab } from "./OrgDocumentsTab";
import { OrgCommentsTab } from "./OrgCommentsTab";
import { OrgRemindersTab } from "./OrgRemindersTab";
import { OrgFeaturesTab } from "./OrgFeaturesTab";
import { OrgAuditLogsTab } from "./OrgAuditLogsTab";
import { OrgBalanceManager } from "./OrgBalanceManager";
import { OrgBillingDocsTab } from "./OrgBillingDocsTab";
import { getPlanInfo, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { SkillspaceImportDialog } from "./SkillspaceImportDialog";
import { SkillspaceBatchImportDialog } from "./SkillspaceBatchImportDialog";
import { StudentBulkImportDialog } from "./StudentBulkImportDialog";

interface Organization {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  inn: string | null;
  contact_name: string | null;
  ai_enabled: boolean;
  ai_provider?: string;
  frdo_enabled?: boolean;
  created_at: string;
  storage_limit_bytes?: number;
  notify_on_limit_80?: boolean;
  notify_on_limit_exceeded?: boolean;
  subscription_plan?: string;
  tariff_custom_label?: string;
  paid_until?: string;
}

interface Student {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
  enrollments: {
    course_title: string;
    progress: number;
    status: string;
    started_at: string;
  }[];
}

interface Course {
  id: string;
  title: string;
  is_published: boolean;
  students_count: number;
  lessons_count: number;
  catalog_order: number;
}

interface OrgDocument {
  id: string;
  name: string;
  type: string;
  file_url: string | null;
  created_at: string;
}

interface UsageData {
  storage_bytes: number;
  ai_generations_count: number;
}

interface UsageHistoryItem {
  month: string;
  month_label: string;
  ai_generations_count: number;
  storage_bytes: number;
}

interface OrganizationDetailsViewProps {
  organization: Organization;
  onBack: () => void;
}

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  start: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  standard: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  professional: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  maximum: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

const cardClass = "shadow-sm hover:shadow-md transition-shadow duration-200";

export function OrganizationDetailsView({ organization, onBack }: OrganizationDetailsViewProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [showSkillspaceImport, setShowSkillspaceImport] = useState(false);
  const [showSkillspaceBatchImport, setShowSkillspaceBatchImport] = useState(false);
  const [showStudentBulkImport, setShowStudentBulkImport] = useState(false);
  const [pendingEnrollmentsCount, setPendingEnrollmentsCount] = useState(0);
  const [skillspaceUpdateCourse, setSkillspaceUpdateCourse] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [usage, setUsage] = useState<UsageData>({ storage_bytes: 0, ai_generations_count: 0 });
  const [usageHistory, setUsageHistory] = useState<UsageHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [settings, setSettings] = useState({
    ai_enabled: organization.ai_enabled,
    ai_provider: organization.ai_provider || "gigachat",
    frdo_enabled: organization.frdo_enabled ?? false,
    name: organization.name,
    email: organization.email,
    phone: organization.phone || "",
    inn: organization.inn || "",
    contact_name: organization.contact_name || "",
    storage_limit_bytes: organization.storage_limit_bytes || getPlanInfo((organization.subscription_plan as SubscriptionPlan) || 'free').limits.storageBytes,
    notify_on_limit_80: organization.notify_on_limit_80 ?? true,
    notify_on_limit_exceeded: organization.notify_on_limit_exceeded ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ login_email: string; login_password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [generatingCredentials, setGeneratingCredentials] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [migratingCourseId, setMigratingCourseId] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<Record<string, { status: 'success' | 'error'; message: string }>>({});
  const [orgBranding, setOrgBranding] = useState<{ coverUrl?: string; primaryColor?: string; logoUrl?: string }>({});
  const [tariffCustomLabel, setTariffCustomLabel] = useState(organization.tariff_custom_label || "");
  const [tariffPaidUntil, setTariffPaidUntil] = useState(organization.paid_until || "");
  const [isSavingTariff, setIsSavingTariff] = useState(false);
  const [customLimits, setCustomLimits] = useState({
    maxCourses: (organization as any).custom_max_courses as number | null,
    maxStudents: (organization as any).custom_max_students as number | null,
    maxTrainedPerMonth: (organization as any).custom_max_trained_per_month as number | null,
    aiGenerationsLimit: (organization as any).custom_ai_generations_limit as number | null,
    storageLimitBytes: (organization as any).custom_storage_limit_bytes as number | null,
  });

  const planKey = (organization.subscription_plan as SubscriptionPlan) || 'free';
  const planInfo = getPlanInfo(planKey);

  // Calculate limit warnings
  const storageLimitPercent = (usage.storage_bytes / settings.storage_limit_bytes) * 100;
  const aiGenerationsLimit = planKey === 'free' ? 3 : Infinity;
  const aiGenerationsPercent = aiGenerationsLimit === Infinity ? 0 : (usage.ai_generations_count / aiGenerationsLimit) * 100;
  const isStorageWarning = storageLimitPercent >= 80;
  const isStorageExceeded = storageLimitPercent >= 100;
  const isAiGenWarning = aiGenerationsLimit !== Infinity && aiGenerationsPercent >= 80;
  const isAiGenExceeded = aiGenerationsLimit !== Infinity && aiGenerationsPercent >= 100;

  // AI should be auto-blocked when generations exceeded on free plan
  const shouldBlockAI = isAiGenExceeded;

  // Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalCourses: 0,
    completedEnrollments: 0,
    averageProgress: 0,
  });

  useEffect(() => {
    fetchAllData();
  }, [organization.id]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStudents(),
        fetchCourses(),
        fetchDocuments(),
        fetchUsage(),
        fetchUsageHistory(),
        fetchCredentials(),
        fetchBranding(),
        fetchPendingEnrollmentsCount(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login")
        .eq("organization_id", organization.id);

      if (error) {
        console.error("Error fetching students:", error);
        return;
      }

      if (!profiles || profiles.length === 0) {
        setStudents([]);
        setStats(prev => ({ ...prev, totalStudents: 0 }));
        return;
      }

      const { data: orgCourses } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", organization.id);

      const courseIds = (orgCourses || []).map(c => c.id);
      const coursesMap: Record<string, string> = Object.fromEntries(
        (orgCourses || []).map(c => [c.id, c.title])
      );

      let enrollments: any[] = [];
      if (courseIds.length > 0) {
        const { data: enrollmentsData, error: enrollError } = await supabase
          .from("enrollments")
          .select("user_id, course_id, progress, status, started_at")
          .in("course_id", courseIds);

        if (enrollError) {
          console.error("Error fetching enrollments:", enrollError);
        } else {
          enrollments = enrollmentsData || [];
        }
      }

      const studentsWithEnrollments = profiles.map(profile => ({
        ...profile,
        enrollments: enrollments
          .filter(e => e.user_id === profile.user_id)
          .map(e => ({
            course_title: coursesMap[e.course_id] || "Неизвестный курс",
            progress: e.progress,
            status: e.status,
            started_at: e.started_at,
          })),
      }));

      setStudents(studentsWithEnrollments);

      const totalEnrollments = enrollments.length;
      const completedEnrollments = enrollments.filter(e => e.status === "completed").length;
      const avgProgress = totalEnrollments > 0
        ? enrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / totalEnrollments
        : 0;

      setStats(prev => ({
        ...prev,
        totalStudents: profiles.length,
        completedEnrollments,
        averageProgress: Math.round(avgProgress),
      }));
    } catch (err) {
      console.error("Error in fetchStudents:", err);
    }
  };

  const fetchCourses = async () => {
    const { data: coursesData, error } = await supabase
      .from("courses")
      .select("id, title, is_published, catalog_order")
      .eq("organization_id", organization.id)
      .order("catalog_order", { ascending: true });

    if (error) {
      console.error("Error fetching courses:", error);
      return;
    }

    const coursesWithStats = await Promise.all(
      (coursesData || []).map(async (course) => {
        const [lessonsResult, enrollmentsResult] = await Promise.all([
          supabase.from("lessons").select("id", { count: "exact" }).eq("course_id", course.id),
          supabase.from("enrollments").select("id", { count: "exact" }).eq("course_id", course.id),
        ]);

        return {
          ...course,
          lessons_count: lessonsResult.count || 0,
          students_count: enrollmentsResult.count || 0,
        };
      })
    );

    setCourses(coursesWithStats);
    setStats(prev => ({ ...prev, totalCourses: coursesData?.length || 0 }));
  };

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("org_documents")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
      return;
    }

    setDocuments(data || []);
  };

  const fetchCredentials = async () => {
    try {
      const { data, error } = await supabase.rpc("get_decrypted_org_credentials", {
        p_organization_id: organization.id,
      });
      if (!error && data && data.length > 0) {
        setCredentials(data[0]);
      }
    } catch (err) {
      console.error("Error fetching credentials:", err);
    }
  };

  const fetchUsage = async () => {
    // Get AI generations from organization_usage
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    const { data: usageRow } = await supabase
      .from("organization_usage")
      .select("ai_generations_count")
      .eq("organization_id", organization.id)
      .eq("month_start", currentMonth)
      .maybeSingle();

    const aiCount = (usageRow as any)?.ai_generations_count || 0;

    // Always calculate real storage by scanning buckets (like StorageManager)
    let totalBytes = 0;
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;

    const scanPath = async (
      client: any,
      bucket: string,
      prefix: string,
      depth = 0,
    ) => {
      try {
        const { data: items } = await client.storage.from(bucket).list(prefix, { limit: 500 });
        if (!items) return;
        for (const f of items) {
          if (f.id === null && depth < 2) {
            await scanPath(client, bucket, `${prefix}/${f.name}`, depth + 1);
          } else if (f.id !== null) {
            totalBytes += (f.metadata as any)?.size || 0;
          }
        }
      } catch { /* bucket/path doesn't exist */ }
    };

    // Get course IDs for this org
    const { data: courses } = await supabase
      .from("courses")
      .select("id")
      .eq("organization_id", organization.id);
    const courseIds = courses?.map(c => c.id) || [];

    // Scan course-level buckets
    const courseScans = courseIds.flatMap(courseId => [
      scanPath(supabase, "course-files", courseId),
      scanPath(supabase, "presentations", courseId),
    ]);

    // Scan org-level buckets
    const orgScans = [
      scanPath(supabase, "org-documents", organization.id),
      scanPath(supabase, "company-documents", organization.id),
      scanPath(supabase, "org-branding", organization.id),
      scanPath(supabase, "library-files", `library/${organization.id}`),
      scanPath(supabase, "billing-documents", organization.id),
      scanPath(supabase, "student-documents", organization.id),
    ];

    await Promise.all([...courseScans, ...orgScans]);

    // External storage (course-videos)
    try {
      const { data: config } = await safeInvoke<any>("get-external-storage-config");
      if (config?.configured && config?.url && config?.key) {
        const { createClient } = await import("@supabase/supabase-js");
        const extClient = createClient(config.url, config.key);
        await Promise.all(
          courseIds.map(courseId => scanPath(extClient, "course-videos", courseId))
        );
      }
    } catch { /* external not configured */ }

    setUsage({
      storage_bytes: totalBytes,
      ai_generations_count: aiCount,
    });
  };

  const fetchUsageHistory = async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().slice(0, 7) + "-01";

    const { data, error } = await supabase
      .from("organization_usage")
      .select("month_start, ai_generations_count, storage_bytes")
      .eq("organization_id", organization.id)
      .gte("month_start", startDate)
      .order("month_start", { ascending: true });

    if (error) {
      console.error("Error fetching usage history:", error);
      return;
    }

    const months: UsageHistoryItem[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 10);
      const existingData = data?.find(d => d.month_start === monthStr);
      
      months.push({
        month: monthStr,
        month_label: format(date, "MMM yy", { locale: ru }),
        ai_generations_count: (existingData as any)?.ai_generations_count || 0,
        storage_bytes: existingData?.storage_bytes || 0,
      });
    }

    setUsageHistory(months);
  };
  const fetchBranding = async () => {
    const { data } = await supabase
      .from("organizations")
      .select("branding")
      .eq("id", organization.id)
      .single();
    if (data?.branding) {
      const b = data.branding as any;
      setOrgBranding({
        coverUrl: b.coverUrl || b.cover_url,
        primaryColor: b.primaryColor || b.primary_color,
        logoUrl: b.logoUrl || b.logo_url,
      });
    }
  };

  const saveTariffSettings = async () => {
    setIsSavingTariff(true);
    try {
      const updatePayload: Record<string, unknown> = {
        tariff_custom_label: tariffCustomLabel || null,
        paid_until: tariffPaidUntil || null,
        custom_max_courses: customLimits.maxCourses,
        custom_max_students: customLimits.maxStudents,
        custom_max_trained_per_month: customLimits.maxTrainedPerMonth,
        custom_ai_generations_limit: customLimits.aiGenerationsLimit,
        custom_storage_limit_bytes: customLimits.storageLimitBytes,
      };
      console.log("Saving tariff settings:", updatePayload);
      const { error } = await supabase
        .from("organizations")
        .update(updatePayload as any)
        .eq("id", organization.id);
      if (error) throw error;
      toast.success("Тарифные настройки сохранены");
    } catch (err) {
      console.error(err);
      toast.error("Ошибка сохранения тарифных настроек");
    } finally {
      setIsSavingTariff(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const aiEnabled = shouldBlockAI ? false : settings.ai_enabled;

      const { error } = await supabase
        .from("organizations")
        .update({
          name: settings.name,
          email: settings.email,
          phone: settings.phone || null,
          inn: settings.inn || null,
          contact_name: settings.contact_name || null,
          ai_enabled: aiEnabled,
          ai_provider: settings.ai_provider,
          frdo_enabled: settings.frdo_enabled,
          storage_limit_bytes: settings.storage_limit_bytes,
          notify_on_limit_80: settings.notify_on_limit_80,
          notify_on_limit_exceeded: settings.notify_on_limit_exceeded,
        } as any)
        .eq("id", organization.id);

      if (error) throw error;
      
      if (shouldBlockAI && settings.ai_enabled) {
        toast.success("Настройки сохранены. ИИ-помощник заблокирован из-за превышения лимита генераций.");
      } else {
        toast.success("Настройки сохранены");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Ошибка сохранения настроек");
    } finally {
      setIsSaving(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Б";
    const k = 1024;
    const sizes = ["Б", "КБ", "МБ", "ГБ"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const fetchPendingEnrollmentsCount = async () => {
    const { count } = await supabase
      .from("pending_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "pending");
    setPendingEnrollmentsCount(count || 0);
  };


  const filteredStudents = students.filter(s => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (s.full_name?.toLowerCase() || "").includes(query) ||
      (s.email?.toLowerCase() || "").includes(query) ||
      (s.login?.toLowerCase() || "").includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 shrink-0">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-display font-bold truncate">{organization.name}</h2>
              <Badge className={`text-xs font-medium border ${PLAN_BADGE_COLORS[planKey] || PLAN_BADGE_COLORS.free}`}>
                {planInfo.name}
              </Badge>
              {shouldBlockAI && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <ShieldOff className="w-3 h-3" />
                  ИИ заблокирован
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
              <span>{organization.email}</span>
              <span className="text-border">•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(organization.created_at), "d MMM yyyy", { locale: ru })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              localStorage.setItem("adminViewAsOrg", JSON.stringify({
                id: organization.id,
                name: organization.name,
              }));
              navigate("/organization");
            }}
          >
            <ExternalLink className="w-4 h-4" />
            Войти в организацию
          </Button>
        </div>
      </div>

      {(isStorageExceeded || isAiGenExceeded) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Лимит превышен!</AlertTitle>
          <AlertDescription>
            {isStorageExceeded && "Лимит хранилища превышен. "}
            {isAiGenExceeded && "Лимит ИИ-генераций превышен. ИИ-помощник автоматически заблокирован. "}
            Увеличьте лимиты в настройках организации.
          </AlertDescription>
        </Alert>
      )}

      {!isStorageExceeded && !isAiGenExceeded && (isStorageWarning || isAiGenWarning) && (
        <Alert className="border-yellow-500 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-600">Приближение к лимиту</AlertTitle>
          <AlertDescription className="text-yellow-600">
            {isStorageWarning && `Хранилище: ${storageLimitPercent.toFixed(0)}% использовано. `}
            {isAiGenWarning && `ИИ-генерации: ${aiGenerationsPercent.toFixed(0)}% использовано. `}
          </AlertDescription>
        </Alert>
      )}

      {/* Organization Cover / Branding Preview */}
      <Card className={cardClass}>
        <CardContent className="p-0 overflow-hidden rounded-lg">
          {orgBranding.coverUrl ? (
            <div className="relative h-40 w-full">
              <img src={orgBranding.coverUrl} alt="Обложка организации" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-4 flex items-center gap-3">
                {orgBranding.logoUrl && (
                  <img src={orgBranding.logoUrl} alt="Логотип" className="w-10 h-10 rounded-lg border border-white/30 bg-white/90 object-contain" />
                )}
                <div>
                  <p className="text-white font-semibold text-lg drop-shadow">{organization.name}</p>
                  <p className="text-white/80 text-sm drop-shadow">{organization.email}</p>
                </div>
              </div>
              {orgBranding.primaryColor && (
                <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/30 rounded-full px-3 py-1">
                  <div className="w-4 h-4 rounded-full border border-white/40" style={{ backgroundColor: orgBranding.primaryColor }} />
                  <span className="text-white text-xs">{orgBranding.primaryColor}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-32 w-full bg-gradient-to-r from-primary/10 to-primary/5 flex items-center justify-center gap-3">
              <Image className="w-8 h-8 text-muted-foreground/40" />
              <span className="text-muted-foreground text-sm">Организация не установила обложку</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-auto min-w-full gap-1 p-1">
            <TabsTrigger value="students" className="flex items-center gap-1.5 shrink-0">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Ученики</span>
            </TabsTrigger>
            <TabsTrigger value="courses" className="flex items-center gap-1.5 shrink-0">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Курсы</span>
            </TabsTrigger>
            <TabsTrigger value="balance" className="flex items-center gap-1.5 shrink-0">
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Баланс</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1.5 shrink-0">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Документы</span>
            </TabsTrigger>
            <TabsTrigger value="features" className="flex items-center gap-1.5 shrink-0">
              <Puzzle className="w-4 h-4" />
              <span className="hidden sm:inline">Функции</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5 shrink-0">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">История</span>
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex items-center gap-1.5 shrink-0">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Заметки</span>
            </TabsTrigger>
            <TabsTrigger value="reminders" className="flex items-center gap-1.5 shrink-0">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Напоминания</span>
            </TabsTrigger>
            <TabsTrigger value="billing-docs" className="flex items-center gap-1.5 shrink-0">
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Закрывающие</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5 shrink-0">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Настройки</span>
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Usage Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-violet-500/10">
                    <Sparkles className="w-5 h-5 text-violet-500" />
                  </div>
                  ИИ-генерации
                </CardTitle>
                <CardDescription>Последние 6 месяцев</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageHistory}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month_label" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                        allowDecimals={false}
                      />
                      <Tooltip 
                        formatter={(value: number) => [value, "Генерации"]}
                        labelClassName="text-foreground"
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar 
                        dataKey="ai_generations_count" 
                        fill="hsl(var(--primary))" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10">
                    <HardDrive className="w-5 h-5 text-cyan-500" />
                  </div>
                  Использование хранилища
                </CardTitle>
                <CardDescription>Последние 6 месяцев</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={usageHistory}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month_label" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatBytes(value)}
                        className="text-muted-foreground"
                      />
                      <Tooltip 
                        formatter={(value: number) => [formatBytes(value), "Хранилище"]}
                        labelClassName="text-foreground"
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="storage_bytes" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Recent Students */}
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className="text-lg">Недавние ученики</CardTitle>
              </CardHeader>
              <CardContent>
                {students.slice(0, 5).map((student) => (
                  <div key={student.id} className="flex items-center justify-between py-2.5 border-b last:border-0 hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors">
                    <div>
                      <p className="font-medium">{student.full_name || "Без имени"}</p>
                      <p className="text-sm text-muted-foreground">{student.email}</p>
                    </div>
                    <Badge variant="secondary">
                      {student.enrollments.length} курсов
                    </Badge>
                  </div>
                ))}
                {students.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">Нет учеников</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Courses */}
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className="text-lg">Курсы</CardTitle>
              </CardHeader>
              <CardContent>
                {courses.slice(0, 5).map((course) => (
                  <div key={course.id} className="flex items-center justify-between py-2.5 border-b last:border-0 hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      <p className="font-medium">{course.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={course.is_published ? "default" : "secondary"}>
                        {course.is_published ? "Опубликован" : "Черновик"}
                      </Badge>
                      <Badge variant="outline">{course.students_count} уч.</Badge>
                    </div>
                  </div>
                ))}
                {courses.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">Нет курсов</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Usage Limits */}
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-lg">Использование ресурсов (текущий месяц)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Хранилище</span>
                    <span className="text-sm font-medium">{formatBytes(usage.storage_bytes)} / {formatBytes(settings.storage_limit_bytes)}</span>
                  </div>
                  <Progress value={Math.min(storageLimitPercent, 100)} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">ИИ-генерации (месяц)</span>
                    <span className="text-sm font-medium">
                      {usage.ai_generations_count} / {aiGenerationsLimit === Infinity ? "∞" : aiGenerationsLimit}
                    </span>
                  </div>
                  <Progress value={aiGenerationsLimit === Infinity ? 0 : Math.min(aiGenerationsPercent, 100)} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Students Tab */}
        <TabsContent value="students" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск учеников..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="outline" className="text-sm">
              Всего: {students.length}
            </Badge>
            {pendingEnrollmentsCount > 0 && (
              <Badge variant="secondary" className="text-sm gap-1">
                <Clock className="w-3 h-3" />
                Ожидают зачисления: {pendingEnrollmentsCount}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowStudentBulkImport(true)}
            >
              <Upload className="w-4 h-4" />
              Импорт из Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                localStorage.setItem('previewStudentDashboard', 'true');
                window.open('/student', '_blank');
              }}
            >
              <Eye className="w-4 h-4" />
              Кабинет ученика
            </Button>
          </div>

          <Card className={cardClass}>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ученик</TableHead>
                      <TableHead>Логин</TableHead>
                      <TableHead>Курсы</TableHead>
                      <TableHead>Прогресс</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student) => (
                      <TableRow key={student.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div>
                            <p className="font-medium">{student.full_name || "Без имени"}</p>
                            <p className="text-sm text-muted-foreground">{student.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {student.login || "—"}
                        </TableCell>
                        <TableCell>
                          {student.enrollments.length > 0 ? (
                            <div className="space-y-1">
                              {student.enrollments.slice(0, 2).map((e, i) => (
                                <Badge key={i} variant="secondary" className="text-xs mr-1">
                                  {e.course_title}
                                </Badge>
                              ))}
                              {student.enrollments.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{student.enrollments.length - 2}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Не записан</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {student.enrollments.length > 0 ? (
                            <div className="space-y-1">
                              {student.enrollments.slice(0, 2).map((e, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <Progress value={Math.min(e.progress, 100)} className="h-1.5 w-16" />
                                  <span className="text-xs text-muted-foreground">{Math.min(e.progress, 100)}%</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {student.enrollments.length > 0 ? (
                            <div className="space-y-1">
                              {student.enrollments.slice(0, 2).map((e, i) => (
                                <Badge
                                  key={i}
                                  variant={
                                    e.status === "completed" ? "default" :
                                    e.status === "in_progress" ? "secondary" : "outline"
                                  }
                                  className="text-xs"
                                >
                                  {e.status === "completed" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                  {e.status === "in_progress" && <Clock className="w-3 h-3 mr-1" />}
                                  {e.status === "active" && <Clock className="w-3 h-3 mr-1" />}
                                  {e.status === "not_started" && <XCircle className="w-3 h-3 mr-1" />}
                                  {e.status === "completed" ? "Завершён" :
                                   e.status === "in_progress" || e.status === "active" ? "В процессе" : "Не начат"}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">Не записан</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              localStorage.setItem('adminViewAsStudent', JSON.stringify({
                                userId: student.user_id,
                                name: student.full_name || student.email,
                                orgName: organization.name,
                              }));
                              navigate('/student');
                            }}
                            title="Войти в кабинет ученика"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredStudents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {searchQuery ? "Ничего не найдено" : "Нет учеников в этой организации"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Courses Tab */}
        <TabsContent value="courses" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted text-sm text-muted-foreground">
              <BookOpen className="w-4 h-4" />
              <span>Всего курсов: <span className="font-semibold text-foreground">{courses.length}</span></span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSkillspaceBatchImport(true)}>
                <Download className="w-4 h-4 mr-2" />
                Пакетный импорт
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowSkillspaceImport(true)}>
                <Download className="w-4 h-4 mr-2" />
                Импорт со SkillSpace
              </Button>
            </div>
          </div>
          <Card className={cardClass}>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Курс</TableHead>
                    <TableHead className="text-center">Уроков</TableHead>
                    <TableHead className="text-center">Учеников</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((course) => (
                    <TableRow key={course.id} className="hover:bg-muted/40">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-primary" />
                          <button
                            onClick={() => window.open(`/course/${course.id}/edit`, '_blank')}
                            className="font-medium text-primary hover:underline cursor-pointer flex items-center gap-1"
                          >
                            {course.title}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{course.lessons_count}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{course.students_count}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={course.is_published ? "default" : "outline"}>
                          {course.is_published ? "Опубликован" : "Черновик"}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${
                            migrationResult[course.id]?.status === 'success'
                              ? 'text-emerald-500'
                              : migrationResult[course.id]?.status === 'error'
                              ? 'text-destructive'
                              : 'text-muted-foreground hover:text-primary'
                          }`}
                          title={migrationResult[course.id]?.message || "Скачать медиа в хранилище"}
                          disabled={migratingCourseId === course.id}
                          onClick={async () => {
                            setMigratingCourseId(course.id);
                            setMigrationResult(prev => { const next = { ...prev }; delete next[course.id]; return next; });
                            try {
                              const res = await fetch(
                                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migrate-course-media`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                                  },
                                  body: JSON.stringify({ courseId: course.id, organizationId: organization.id }),
                                  signal: AbortSignal.timeout(300000),
                                }
                              );
                              const data = await res.json();
                              if (data.success) {
                                const msg = `Перенесено: ${data.filesTransferred}, ошибок: ${data.filesFailed || 0}, пропущено: ${data.filesSkipped || 0}`;
                                setMigrationResult(prev => ({ ...prev, [course.id]: { status: 'success', message: msg } }));
                                toast.success(msg, { duration: 15000 });
                              } else {
                                const isWorkerLimit = data.error?.includes("WORKER_LIMIT") || data.code === "WORKER_LIMIT";
                                const msg = isWorkerLimit
                                  ? "Файлы слишком большие для автоматического переноса"
                                  : (data.error || "Ошибка миграции");
                                setMigrationResult(prev => ({ ...prev, [course.id]: { status: 'error', message: msg } }));
                                toast.error(msg, { duration: 15000 });
                              }
                            } catch (e: any) {
                              const isTimeout = e.name === "TimeoutError" || e.name === "AbortError";
                              const msg = isTimeout
                                ? "Миграция заняла слишком много времени. Попробуйте ещё раз — уже перенесённые файлы не будут скачаны повторно"
                                : "Ошибка: " + e.message;
                              setMigrationResult(prev => ({ ...prev, [course.id]: { status: 'error', message: msg } }));
                              toast.error(msg, { duration: 15000 });
                            } finally {
                              setMigratingCourseId(null);
                              setTimeout(() => {
                                setMigrationResult(prev => { const next = { ...prev }; delete next[course.id]; return next; });
                              }, 10000);
                            }
                          }}
                        >
                          {migratingCourseId === course.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : migrationResult[course.id]?.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : migrationResult[course.id]?.status === 'error' ? (
                            <XCircle className="w-4 h-4" />
                          ) : (
                            <HardDrive className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          title="Обновить из SkillSpace (тесты + очистка контента)"
                          onClick={() => setSkillspaceUpdateCourse({ id: course.id, title: course.title })}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            if (!confirm(`Удалить курс «${course.title}»? Это действие нельзя отменить.`)) return;
                            const { error } = await supabase.from("courses").delete().eq("id", course.id);
                            if (error) {
                              toast.error("Ошибка удаления: " + error.message);
                            } else {
                              toast.success("Курс удалён");
                              fetchCourses();
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {courses.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Нет курсов
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balance Tab */}
        <TabsContent value="balance" className="space-y-4">
          <OrgBalanceManager organizationId={organization.id} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <OrgDocumentsTab
            organizationId={organization.id}
            documents={documents}
            onDocumentsChange={fetchDocuments}
          />
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-4">
          <OrgFeaturesTab
            organizationId={organization.id}
            organizationName={organization.name}
          />
        </TabsContent>

        {/* History/Audit Logs Tab */}
        <TabsContent value="history" className="space-y-4">
          <OrgAuditLogsTab organizationId={organization.id} />
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments" className="space-y-4">
          <OrgCommentsTab organizationId={organization.id} />
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="space-y-4">
          <OrgRemindersTab organizationId={organization.id} />
        </TabsContent>

        {/* Billing Documents Tab */}
        <TabsContent value="billing-docs">
          <OrgBillingDocsTab organizationId={organization.id} />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card className={`${cardClass} border-primary/20`}>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-1.5">
                <div className="p-1 rounded-md bg-primary/10">
                  <KeyRound className="w-3 h-3 text-primary" />
                </div>
                Учётные данные организации
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {credentials ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Логин:</span>
                      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{credentials.login_email}</code>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        navigator.clipboard.writeText(credentials.login_email);
                        toast.success("Логин скопирован");
                      }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Пароль:</span>
                      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                        {showPassword ? credentials.login_password : "••••••••"}
                      </code>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        navigator.clipboard.writeText(credentials.login_password);
                        toast.success("Пароль скопирован");
                      }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                      const text = `Логин: ${credentials.login_email}\nПароль: ${credentials.login_password}`;
                      navigator.clipboard.writeText(text);
                      toast.success("Логин и пароль скопированы");
                    }}>
                      <Copy className="w-3.5 h-3.5" />
                      Скопировать всё
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resettingPassword}
                    onClick={async () => {
                      setResettingPassword(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("reset-org-password", {
                          body: { organization_id: organization.id }
                        });
                        if (error) throw error;
                        toast.success("Пароль сброшен");
                        // Reload credentials
                        const { data: newCreds } = await supabase.rpc('get_decrypted_org_credentials', { p_organization_id: organization.id });
                        if (newCreds && newCreds.length > 0) {
                          setCredentials(newCreds[0]);
                        }
                      } catch (err: any) {
                        console.error("Reset password error:", err);
                        toast.error("Ошибка сброса пароля");
                      } finally {
                        setResettingPassword(false);
                      }
                    }}
                  >
                    {resettingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                    Сбросить пароль
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Логин:</span>
                    <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{organization.email || "—"}</code>
                    {organization.email && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        navigator.clipboard.writeText(organization.email);
                        toast.success("Email скопирован");
                      }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground italic">Пароль не сохранён в системе</span>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={generatingCredentials}
                    onClick={async () => {
                      setGeneratingCredentials(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("generate-org-credentials", {
                          body: { organization_id: organization.id }
                        });
                        if (error) throw error;
                        toast.success(`Учётные данные созданы: ${data.login_email}`);
                        // Reload credentials
                        const { data: newCreds } = await supabase.rpc('get_decrypted_org_credentials', { p_organization_id: organization.id });
                        if (newCreds && newCreds.length > 0) {
                          setCredentials(newCreds[0]);
                        }
                      } catch (err: any) {
                        console.error("Generate credentials error:", err);
                        toast.error("Ошибка генерации учётных данных");
                      } finally {
                        setGeneratingCredentials(false);
                      }
                    }}
                  >
                    {generatingCredentials ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                    Сгенерировать учётные данные
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle>Настройки организации</CardTitle>
              <CardDescription>Управление параметрами организации</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Название организации</Label>
                  <Input
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Телефон</Label>
                  <Input
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ИНН</Label>
                  <Input
                    value={settings.inn}
                    onChange={(e) => setSettings({ ...settings, inn: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Контактное лицо</Label>
                  <Input
                    value={settings.contact_name}
                    onChange={(e) => setSettings({ ...settings, contact_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
                  <div className="space-y-1">
                    <Label className="text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                      ИИ-помощник
                      {shouldBlockAI && (
                        <Badge variant="destructive" className="text-xs">
                          <ShieldOff className="w-3 h-3 mr-1" />
                          Заблокирован
                        </Badge>
                      )}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {shouldBlockAI 
                        ? "ИИ-помощник заблокирован из-за превышения лимита генераций"
                        : "Разрешить использование ИИ-помощника для учеников"
                      }
                    </p>
                  </div>
                  <Switch
                    checked={settings.ai_enabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, ai_enabled: checked })}
                    disabled={shouldBlockAI}
                  />
                </div>

                {settings.ai_enabled && (
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl ml-4 border border-border/60">
                    <div className="space-y-1">
                      <Label className="text-sm">ИИ-провайдер</Label>
                      <p className="text-xs text-muted-foreground">Выберите провайдера для генерации контента</p>
                    </div>
                    <Select
                      value={settings.ai_provider}
                      onValueChange={(value) => setSettings({ ...settings, ai_provider: value })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gigachat">GigaChat</SelectItem>
                        <SelectItem value="lovable_ai">Lovable AI (Gemini)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-500" />
                      ФИС ФРДО
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Включить модуль для работы с федеральным реестром документов
                    </p>
                  </div>
                  <Switch
                    checked={settings.frdo_enabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, frdo_enabled: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Limits Settings Card */}
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10">
                  <HardDrive className="w-5 h-5 text-cyan-500" />
                </div>
                Лимиты ресурсов
              </CardTitle>
              <CardDescription>Установите ограничения на использование ресурсов организацией</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Лимит хранилища (ГБ)</Label>
                    <Input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={(settings.storage_limit_bytes / (1024 * 1024 * 1024)).toFixed(1)}
                      onChange={(e) => setSettings({ 
                        ...settings, 
                        storage_limit_bytes: Math.round(parseFloat(e.target.value || "1") * 1024 * 1024 * 1024)
                      })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Текущее использование: {formatBytes(usage.storage_bytes)} ({storageLimitPercent.toFixed(1)}%)
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>ИИ-генерации (лимит по тарифу)</Label>
                    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">
                          {aiGenerationsLimit === Infinity ? "Безлимит" : `${aiGenerationsLimit} генераций / мес`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Использовано: {usage.ai_generations_count} {aiGenerationsLimit !== Infinity ? `(${aiGenerationsPercent.toFixed(1)}%)` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  Уведомления
                </h4>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Предупреждение при 80%</Label>
                    <p className="text-sm text-muted-foreground">
                      Показывать предупреждение при достижении 80% лимита
                    </p>
                  </div>
                  <Switch
                    checked={settings.notify_on_limit_80}
                    onCheckedChange={(checked) => setSettings({ ...settings, notify_on_limit_80: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Уведомление о превышении</Label>
                    <p className="text-sm text-muted-foreground">
                      Показывать уведомление при превышении лимита
                    </p>
                  </div>
                  <Switch
                    checked={settings.notify_on_limit_exceeded}
                    onCheckedChange={(checked) => setSettings({ ...settings, notify_on_limit_exceeded: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Single Save Button */}
          <Button onClick={saveSettings} disabled={isSaving} className="w-full md:w-auto" size="lg">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Сохранить все настройки
          </Button>
        </TabsContent>
      </Tabs>
    </div>

    <SkillspaceImportDialog
      open={showSkillspaceImport}
      onOpenChange={setShowSkillspaceImport}
      organizationId={organization.id}
      onSuccess={() => {
        // Refresh courses
        supabase
          .from("courses")
          .select("id, title, is_published, lessons(id), enrollments(id)")
          .eq("organization_id", organization.id)
          .then(({ data }) => {
            if (data) {
               setCourses(data.map((c: any) => ({
                 id: c.id,
                 title: c.title,
                 is_published: c.is_published,
                 lessons_count: c.lessons?.length || 0,
                 students_count: c.enrollments?.length || 0,
                 catalog_order: c.catalog_order || 0,
               })));
            }
          });
      }}
    />
    {skillspaceUpdateCourse && (
      <SkillspaceImportDialog
        open={!!skillspaceUpdateCourse}
        onOpenChange={(open) => { if (!open) setSkillspaceUpdateCourse(null); }}
        organizationId={organization.id}
        existingCourseId={skillspaceUpdateCourse.id}
        existingCourseTitle={skillspaceUpdateCourse.title}
        onSuccess={() => fetchCourses()}
      />
    )}
    <SkillspaceBatchImportDialog
      open={showSkillspaceBatchImport}
      onOpenChange={setShowSkillspaceBatchImport}
      organizationId={organization.id}
      onSuccess={() => fetchCourses()}
    />
    <StudentBulkImportDialog
      open={showStudentBulkImport}
      onOpenChange={setShowStudentBulkImport}
      organizationId={organization.id}
      onImportComplete={() => { fetchStudents(); fetchPendingEnrollmentsCount(); }}
    />
    </>
  );
}
