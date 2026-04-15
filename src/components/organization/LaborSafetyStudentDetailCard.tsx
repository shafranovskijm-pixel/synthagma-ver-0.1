import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
 import { useState, useEffect, useRef } from "react";
 import { openPrivateFile, extractStoragePath } from "@/utils/storageHelpers";
 import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Checkbox } from "@/components/ui/checkbox";
 import { Progress } from "@/components/ui/progress";
 import { supabase } from "@/integrations/supabase/client";
 import { safeInvoke } from "@/utils/safeInvoke";
 import { toast } from "sonner";
 import {
   User,
   FileText,
   Shield,
   Video,
   BookOpen,
   CheckCircle2,
   Camera,
   GraduationCap,
   Upload,
   Trash2,
   Eye,
   EyeOff,
   XCircle,
   Download,
   Bell,
   Key,
   Pencil,
   Copy,
   Check,
   RotateCcw,
   Plus,
   Mail,
   RefreshCw } from "lucide-react";
 import { format } from "date-fns";
 import { ru } from "date-fns/locale";
 
 interface LaborSafetyRecord {
   id: string;
   group_id: string;
   full_name: string;
   snils: string | null;
   position: string | null;
   inn: string | null;
   organization_name: string | null;
   protocol_number: string | null;
   program_name: string | null;
   exam_date: string | null;
   is_passed: boolean;
   created_at?: string;
 }
 
 interface LaborSafetyProfile {
   id: string;
   user_id: string;
   full_name: string;
   login: string | null;
   generated_password: string | null;
   email: string | null;
   organization_id: string;
   record_id: string | null;
 }
 
 interface Course {
   id: string;
   title: string;
 }
 
 interface Enrollment {
   id: string;
   course_id: string;
   course_title: string;
   progress: number;
   status: string;
   started_at: string;
   completed_at?: string | null;
 }
 
 interface VerificationRecord {
   id: string;
   status: string;
   photo_url: string | null;
   created_at: string;
   verified_at: string | null;
   rejection_reason: string | null;
 }
 
 interface IdentityDocumentRecord {
   id: string;
   type: string;
   name: string;
   file_url: string | null;
   created_at: string;
 }
 
 interface LaborSafetyStudentDetailCardProps {
   isOpen: boolean;
   onOpenChange: (open: boolean) => void;
   record: LaborSafetyRecord | null;
   organizationId: string;
   onRecordUpdated?: () => void;
 }
 
 export function LaborSafetyStudentDetailCard({
   isOpen,
   onOpenChange,
   record,
   organizationId,
   onRecordUpdated }: LaborSafetyStudentDetailCardProps) {
   const [activeTab, setActiveTab] = useState("profile");
   const [isLoading, setIsLoading] = useState(true);
   const [profile, setProfile] = useState<LaborSafetyProfile | null>(null);
   const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
   const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
   const [identityDocs, setIdentityDocs] = useState<IdentityDocumentRecord[]>([]);
   const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
   
   // Credentials editing
   const [isEditingCredentials, setIsEditingCredentials] = useState(false);
   const [newLogin, setNewLogin] = useState("");
   const [newPassword, setNewPassword] = useState("");
   const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
   const [copiedField, setCopiedField] = useState<string | null>(null);
   
   // Document upload
   const fileInputRef = useRef<HTMLInputElement>(null);
   const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
   const [uploadingType, setUploadingType] = useState<string | null>(null);
   
   // Enrollment
   const [isAddingCourse, setIsAddingCourse] = useState(false);
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
   const [isEnrolling, setIsEnrolling] = useState(false);
   
   // Reminders
   const [isSendingReminder, setIsSendingReminder] = useState(false);
   
   // Creating profile
   const [isCreatingProfile, setIsCreatingProfile] = useState(false);
   const [isSendingCredentials, setIsSendingCredentials] = useState(false);
 
 // Password visibility
 const [showPassword, setShowPassword] = useState(false);
 
   useEffect(() => {
     if (isOpen && record) {
       loadData();
     }
   }, [isOpen, record]);
 
   const loadData = async () => {
     if (!record) return;
     setIsLoading(true);
 
     try {
       // Find or create labor safety profile
       const { data: existingProfile, error: profileError } = await supabase
         .from("labor_safety_profiles")
         .select("*")
         .eq("record_id", record.id)
         .eq("organization_id", organizationId)
         .maybeSingle();
 
       if (profileError && profileError.code !== 'PGRST116') throw profileError;
 
       if (existingProfile) {
         // If password is missing in labor_safety_profiles, try to get from profiles table
         let profileData = existingProfile;
          if (!existingProfile.generated_password && existingProfile.user_id) {
            // Try to get decrypted password from profiles via RPC
            const { data: decryptedPw } = await supabase
              .rpc("get_decrypted_student_password", { p_user_id: existingProfile.user_id });
            
            if (decryptedPw) {
              const { data: mainProfile } = await supabase
                .from("profiles")
                .select("login")
                .eq("user_id", existingProfile.user_id)
                .maybeSingle();
              
              profileData = {
                ...existingProfile,
                generated_password: decryptedPw,
                login: existingProfile.login || mainProfile?.login };
              // Update labor_safety_profiles with the password for future
              await supabase
                .from("labor_safety_profiles")
                .update({
                  generated_password: decryptedPw,
                  login: existingProfile.login || mainProfile?.login })
                .eq("id", existingProfile.id);
            }
          } else if (existingProfile.generated_password) {
            // Decrypt the stored password
            const { data: decryptedPw } = await supabase
              .rpc("get_decrypted_labor_password", { p_user_id: existingProfile.user_id });
            if (decryptedPw) {
              profileData = { ...existingProfile, generated_password: decryptedPw };
            }
          }
         setProfile(profileData);
         
         // Load enrollments
         const { data: enrollmentData } = await supabase
           .from("enrollments")
           .select("id, course_id, progress, status, started_at, completed_at, courses(title)")
           .eq("user_id", existingProfile.user_id);
         
         if (enrollmentData) {
           setEnrollments(enrollmentData.map((e: any) => ({
             id: e.id,
             course_id: e.course_id,
             course_title: e.courses?.title || "Курс",
             progress: e.progress,
             status: e.status,
             started_at: e.started_at,
             completed_at: e.completed_at })));
         }
         
         // Load verifications
         const { data: verificationData } = await supabase
           .from("video_identifications")
           .select("*")
           .eq("user_id", existingProfile.user_id)
           .eq("organization_id", organizationId)
           .order("created_at", { ascending: false });
         
         if (verificationData) setVerifications(verificationData);
         
         // Load identity documents
         const { data: docsData } = await supabase
           .from("student_identity_documents")
           .select("*")
           .eq("user_id", existingProfile.user_id)
           .eq("organization_id", organizationId)
           .order("created_at", { ascending: false });
         
         if (docsData) setIdentityDocs(docsData);
       } else {
         setProfile(null);
         setEnrollments([]);
         setVerifications([]);
         setIdentityDocs([]);
       }
 
       // Load available courses
       // First find the "Охрана труда" category
       const { data: categoryData } = await supabase
         .from("course_categories")
         .select("id")
         .eq("organization_id", organizationId)
         .ilike("name", "%охрана труда%")
         .maybeSingle();
       
       let coursesQuery = supabase
         .from("courses")
         .select("id, title")
         .eq("organization_id", organizationId)
         .eq("is_published", true)
         .order("title");
       
       // Filter by category if found
       if (categoryData?.id) {
         coursesQuery = coursesQuery.eq("category_id", categoryData.id);
       }
       
       const { data: coursesData } = await coursesQuery;
       
       if (coursesData) setAvailableCourses(coursesData);
 
     } catch (error) {
       console.error("Error loading data:", error);
       toast.error("Ошибка загрузки данных");
     } finally {
       setIsLoading(false);
     }
   };
 
   const createProfileForRecord = async () => {
     if (!record) return;
     
     setIsCreatingProfile(true);
     try {
       const { data, error } = await safeInvoke<any>("register-student", {
         body: {
           organization_id: organizationId,
           full_name: record.full_name }
       });
       
       if (error) throw error;
       if (data?.error) throw new Error(data.error);
       
       if (data?.user_id) {
         // Link to labor safety profile
         const { error: linkError } = await supabase
           .from("labor_safety_profiles")
           .upsert({
             user_id: data.user_id,
             full_name: record.full_name,
             login: data.login,
             generated_password: data.password || data.generated_password,
             email: data.email,
             organization_id: organizationId,
             record_id: record.id }, { onConflict: 'record_id' });
         
         if (linkError) throw linkError;
         
         toast.success("Учётная запись создана");
         loadData();
         onRecordUpdated?.();
       }
     } catch (error: any) {
       console.error("Error creating profile:", error);
       toast.error(error.message || "Ошибка создания профиля");
     } finally {
       setIsCreatingProfile(false);
     }
   };

   const sendCredentialsToUser = async () => {
     if (!profile || !profile.login) {
       toast.error("Нет учётных данных для отправки");
       return;
     }

     setIsSendingCredentials(true);
     try {
       const { error } = await safeInvoke<any>("send-credentials", {
         body: {
           user_id: profile.user_id,
           organization_id: organizationId }
       });

       if (error) throw error;
       toast.success("Учётные данные отправлены на email");
     } catch (error: any) {
       console.error("Error sending credentials:", error);
       toast.error(error.message || "Ошибка отправки");
     } finally {
       setIsSendingCredentials(false);
     }
   };
 
   const copyToClipboard = async (text: string, field: string) => {
     try {
       await navigator.clipboard.writeText(text);
       setCopiedField(field);
       setTimeout(() => setCopiedField(null), 2000);
       toast.success("Скопировано в буфер обмена");
     } catch {
       toast.error("Не удалось скопировать");
     }
   };
 
   const handleUpdateCredentials = async () => {
     if (!profile) return;
     
     if (!newLogin && !newPassword) {
       toast.error("Укажите новый логин или пароль");
       return;
     }
 
     setIsUpdatingCredentials(true);
     try {
       const { data, error } = await safeInvoke<any>('update-student-credentials', {
         body: {
           user_id: profile.user_id,
           new_login: newLogin || undefined,
           new_password: newPassword || undefined }
       });
 
       if (error) throw error;
       if (data?.error) throw new Error(data.error);
 
       toast.success("Учетные данные обновлены");
       setIsEditingCredentials(false);
       setNewLogin("");
       setNewPassword("");
       loadData();
       onRecordUpdated?.();
     } catch (error: any) {
       toast.error(error.message || "Ошибка обновления");
     } finally {
       setIsUpdatingCredentials(false);
     }
   };
 
   const handleManualVerification = async (verified: boolean) => {
     if (!profile) return;
     
     try {
       const latestVerification = verifications[0];
       
       if (verified) {
         if (latestVerification) {
           await supabase
             .from("video_identifications")
             .update({ status: "verified", verified_at: new Date().toISOString() })
             .eq("id", latestVerification.id);
         } else {
           await supabase
             .from("video_identifications")
             .insert({
               user_id: profile.user_id,
               organization_id: organizationId,
               status: "verified",
               verified_at: new Date().toISOString() });
         }
         toast.success("Видеоидентификация отмечена как пройденная");
       } else {
         if (latestVerification) {
           await supabase
             .from("video_identifications")
             .update({ status: "pending", verified_at: null })
             .eq("id", latestVerification.id);
           toast.success("Статус видеоидентификации сброшен");
         }
       }
       
       loadData();
       onRecordUpdated?.();
     } catch (error) {
       console.error("Error updating verification:", error);
       toast.error("Ошибка обновления статуса");
     }
   };
 
   const handleUploadClick = (docType: string) => {
     setSelectedDocType(docType);
     fileInputRef.current?.click();
   };
 
   const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file || !profile || !selectedDocType) return;
 
     setUploadingType(selectedDocType);
     
     try {
       const fileExt = file.name.split('.').pop();
       const fileName = `${profile.user_id}/${selectedDocType}_${Date.now()}.${fileExt}`;
       
       const { error: uploadError } = await supabase.storage
         .from("student-documents")
         .upload(fileName, file);
 
       if (uploadError) throw uploadError;
 
       const docNames: Record<string, string> = {
         passport: "Паспорт",
         birth_certificate: "Свидетельство о рождении",
         snils: "СНИЛС",
         education_document: "Документ об образовании" };
 
       await supabase.from("student_identity_documents").insert({
         user_id: profile.user_id,
         organization_id: organizationId,
         type: selectedDocType,
         name: docNames[selectedDocType] || file.name,
         file_url: fileName,
         file_path: fileName });
 
       toast.success("Документ загружен");
       loadData();
     } catch (error) {
       console.error("Error uploading document:", error);
       toast.error("Ошибка загрузки документа");
     } finally {
       setUploadingType(null);
       setSelectedDocType(null);
       if (fileInputRef.current) fileInputRef.current.value = "";
     }
   };
 
   const handleDeleteDoc = async (doc: IdentityDocumentRecord) => {
     try {
       if (doc.file_url) {
         const path = extractStoragePath(doc.file_url, "student-documents");
         if (path) {
           await supabase.storage.from("student-documents").remove([path]);
         }
       }
 
       await supabase.from("student_identity_documents").delete().eq("id", doc.id);
       toast.success("Документ удалён");
       loadData();
     } catch (error) {
       console.error("Error deleting document:", error);
       toast.error("Ошибка удаления документа");
     }
   };
 
   const handleEnrollToCourse = async () => {
      if (!profile || selectedCourseIds.length === 0) return;
     
     setIsEnrolling(true);
     try {
        let enrolledCount = 0;
        let alreadyEnrolledCount = 0;
        
        for (const courseId of selectedCourseIds) {
          // Check existing enrollment
          const { data: existing } = await supabase
            .from("enrollments")
            .select("id")
            .eq("user_id", profile.user_id)
            .eq("course_id", courseId)
            .maybeSingle();
          
          if (existing) {
            alreadyEnrolledCount++;
            continue;
          }
          
          await supabase.from("enrollments").insert({
            user_id: profile.user_id,
            course_id: courseId,
            status: "active" });
          enrolledCount++;
       }
       
        if (enrolledCount > 0) {
          toast.success(`Зачислен на ${enrolledCount} курс(ов)`);
        }
        if (alreadyEnrolledCount > 0) {
          toast.info(`Уже зачислен на ${alreadyEnrolledCount} курс(ов)`);
        }
       setIsAddingCourse(false);
        setSelectedCourseIds([]);
       loadData();
     } catch (error) {
       console.error("Error enrolling:", error);
       toast.error("Ошибка зачисления");
     } finally {
       setIsEnrolling(false);
     }
   };
 
   const handleRemoveEnrollment = async (enrollmentId: string) => {
     try {
       await supabase.from("enrollments").delete().eq("id", enrollmentId);
       toast.success("Отчислен с курса");
       loadData();
     } catch (error) {
       console.error("Error removing enrollment:", error);
       toast.error("Ошибка отчисления");
     }
   };
 
   const handleResetProgress = async (enrollmentId: string, courseId: string) => {
     if (!profile) return;
     
     try {
       // Reset enrollment progress
       await supabase
         .from("enrollments")
         .update({ progress: 0, status: "active", completed_at: null })
         .eq("id", enrollmentId);
       
       // Delete lesson progress
       const { data: lessons } = await supabase
         .from("lessons")
         .select("id")
         .eq("course_id", courseId);
       
       if (lessons && lessons.length > 0) {
         await supabase
           .from("lesson_progress")
           .delete()
           .eq("user_id", profile.user_id)
           .in("lesson_id", lessons.map(l => l.id));
       }
       
       toast.success("Прогресс сброшен");
       loadData();
     } catch (error) {
       console.error("Error resetting progress:", error);
       toast.error("Ошибка сброса прогресса");
     }
   };
 
   const getMissingDocuments = () => {
     const requiredDocs = [
       { type: "passport", label: "Паспорт или свидетельство о рождении" },
       { type: "snils", label: "СНИЛС" },
       { type: "education_document", label: "Документ об образовании" },
     ];
     
     return requiredDocs.filter(doc => {
       if (doc.type === "passport") {
         return !identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate");
       }
       if (doc.type === "education_document") {
         return !identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat");
       }
       return !identityDocs.some(d => d.type === doc.type);
     });
   };
 
   const formatDate = (dateStr: string) => {
     return format(new Date(dateStr), "d MMMM yyyy, HH:mm", { locale: ru });
   };
 
   const getStatusBadge = (status: string) => {
     switch (status) {
       case "verified":
       case "signed":
         return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подтверждено</Badge>;
       case "rejected":
         return <Badge variant="destructive">Отклонено</Badge>;
       case "completed":
         return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Завершён</Badge>;
       case "active":
         return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Активен</Badge>;
       case "pending":
         return <Badge variant="outline">На проверке</Badge>;
       default:
         return <Badge variant="secondary">{status}</Badge>;
     }
   };
 
   const latestVerification = verifications[0];
   const enrolledCourseIds = new Set(enrollments.map(e => e.course_id));
   const coursesToEnroll = availableCourses.filter(c => !enrolledCourseIds.has(c.id));
 
   const checklistItems = [
     {
       id: "contract",
       label: "Договор",
       icon: FileText,
       completed: identityDocs.some(d => d.type === "contract" || d.type === "agreement"),
       uploadable: true,
       uploadType: "contract" },
     {
       id: "passport",
       label: "Паспорт / Св-во о рождении",
       icon: User,
       completed: identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate"),
       uploadable: true,
       uploadType: "passport" },
     {
       id: "snils",
       label: "СНИЛС",
       icon: Shield,
       completed: identityDocs.some(d => d.type === "snils"),
       uploadable: true,
       uploadType: "snils" },
   ];
 
   if (!record) return null;
 
   return (
     <Dialog open={isOpen} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-4xl max-h-[90vh] rounded-2xl p-0 overflow-hidden">
         <DialogHeader className="p-6 pb-0">
           <DialogTitle className="font-display flex items-center gap-3">
             <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
               <User className="w-6 h-6 text-primary" />
             </div>
             <div>
               <div className="text-xl">{record.full_name}</div>
               <div className="text-sm font-normal text-muted-foreground">
                 {profile?.email || record.organization_name || "Охрана труда"}
               </div>
             </div>
           </DialogTitle>
         </DialogHeader>
 
         <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
           <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
             <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
               <User className="w-4 h-4" />
               Личное дело
             </TabsTrigger>
             <TabsTrigger value="identification" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
               <Video className="w-4 h-4" />
               Идентификация
             </TabsTrigger>
             <TabsTrigger value="courses" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
               <BookOpen className="w-4 h-4" />
               Курсы
             </TabsTrigger>
             <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
               <FileText className="w-4 h-4" />
               Документы
             </TabsTrigger>
           </TabsList>
 
           <ScrollArea className="h-[60vh]">
             <div className="p-6">
               {isLoading ? (
                 <div className="flex items-center justify-center py-12">
                   <SigmaSpinner size="lg" />
                 </div>
               ) : (
                 <>
                   {/* Profile Tab */}
                   <TabsContent value="profile" className="m-0 space-y-6">
                     {/* Email, Login, Courses stats */}
                     <div className="grid grid-cols-3 gap-4">
                       <div className="p-4 rounded-xl bg-card border border-border">
                         <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                           <Mail className="w-4 h-4" />
                           Email
                         </div>
                         <div className="font-medium truncate">{profile?.email || "—"}</div>
                       </div>
                       <div className="p-4 rounded-xl bg-card border border-border">
                         <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                           <User className="w-4 h-4" />
                           Логин
                         </div>
                         <div className="font-medium">{profile?.login || "—"}</div>
                       </div>
                       <div className="p-4 rounded-xl bg-card border border-border">
                         <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                           <RefreshCw className="w-4 h-4" />
                           Курсов
                         </div>
                         <div className="font-medium">{enrollments.length}</div>
                       </div>
                     </div>
 
                     {/* Create or show credentials */}
                     {!profile ? (
                       <div className="bg-card rounded-2xl border border-border p-6">
                         <div className="text-center">
                           <Key className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                           <p className="text-muted-foreground mb-4">
                             Учётная запись для входа не создана
                           </p>
                          <Button onClick={createProfileForRecord} disabled={isCreatingProfile}>
                            {isCreatingProfile ? (
                              <SigmaSpinner size="sm" className="mr-2" />
                            ) : (
                              <Plus className="w-4 h-4 mr-2" />
                            )}
                             Создать учётную запись
                           </Button>
                         </div>
                       </div>
                     ) : (
                       <div className="bg-card rounded-2xl border border-border p-6">
                         <div className="flex items-center justify-between mb-4">
                           <h3 className="font-semibold flex items-center gap-2">
                             <Key className="w-5 h-5 text-primary" />
                             Учетные данные для входа
                           </h3>
                           {!isEditingCredentials && (
                             <Button
                               size="sm"
                               variant="outline"
                               className="rounded-lg gap-2"
                               onClick={() => {
                                 setNewLogin(profile.login || "");
                                 setNewPassword("");
                                 setIsEditingCredentials(true);
                               }}
                             >
                               <Pencil className="w-4 h-4" />
                               Изменить
                             </Button>
                           )}
                         </div>
 
                         {isEditingCredentials ? (
                           <div className="space-y-4">
                             <div className="space-y-2">
                               <Label>Новый логин</Label>
                               <Input
                                 value={newLogin}
                                 onChange={(e) => setNewLogin(e.target.value)}
                                 placeholder="Логин (латинские буквы, цифры, _)"
                                 className="rounded-lg"
                               />
                             </div>
                             <div className="space-y-2">
                               <Label>Новый пароль</Label>
                               <Input
                                 type="text"
                                 value={newPassword}
                                 onChange={(e) => setNewPassword(e.target.value)}
                                 placeholder="Оставьте пустым, чтобы не менять"
                                 className="rounded-lg"
                               />
                             </div>
                             <div className="flex gap-2">
                               <Button
                                 size="sm"
                                 onClick={handleUpdateCredentials}
                                 disabled={isUpdatingCredentials}
                               >
                                 {isUpdatingCredentials ? <SigmaSpinner size="sm" /> : <Check className="w-4 h-4" />}
                                 Сохранить
                               </Button>
                               <Button
                                 size="sm"
                                 variant="outline"
                                 onClick={() => {
                                   setIsEditingCredentials(false);
                                   setNewLogin("");
                                   setNewPassword("");
                                 }}
                                 disabled={isUpdatingCredentials}
                               >
                                 Отмена
                               </Button>
                             </div>
                           </div>
                         ) : (
                           <div className="grid grid-cols-2 gap-4">
                             <div className="p-3 rounded-lg bg-muted/50">
                               <div className="text-xs text-muted-foreground mb-1">Логин</div>
                               <div className="flex items-center justify-between">
                                 <code className="font-mono text-sm">{profile.login || "—"}</code>
                                 {profile.login && (
                                   <Button
                                     size="icon"
                                     variant="ghost"
                                     className="h-6 w-6"
                                     onClick={() => copyToClipboard(profile.login || "", "login")}
                                   >
                                     {copiedField === "login" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                   </Button>
                                 )}
                               </div>
                             </div>
                             <div className="p-3 rounded-lg bg-muted/50">
                               <div className="text-xs text-muted-foreground mb-1">Пароль</div>
                               <div className="flex items-center justify-between">
                                 <code className="font-mono text-sm">
                                   {profile.generated_password 
                                     ? (showPassword ? profile.generated_password : "••••••••") 
                                     : "—"}
                                 </code>
                                 <div className="flex items-center gap-1">
                                   {profile.generated_password && (
                                     <Button
                                       size="icon"
                                       variant="ghost"
                                       className="h-6 w-6"
                                       onClick={() => setShowPassword(!showPassword)}
                                       title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                                     >
                                       {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                     </Button>
                                   )}
                                   {profile.generated_password && (
                                   <Button
                                     size="icon"
                                     variant="ghost"
                                     className="h-6 w-6"
                                     onClick={() => copyToClipboard(profile.generated_password || "", "password")}
                                   >
                                     {copiedField === "password" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                   </Button>
                                 )}
                                 </div>
                               </div>
                             </div>
                           </div>
                         )}

                         {/* Send credentials button */}
                         {profile.login && profile.generated_password && (
                           <div className="mt-4 pt-4 border-t border-border">
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={sendCredentialsToUser}
                               disabled={isSendingCredentials}
                               className="w-full gap-2"
                             >
                               {isSendingCredentials ? (
                                 <SigmaSpinner size="sm" />
                               ) : (
                                 <Mail className="w-4 h-4" />
                               )}
                               Отправить данные на email
                             </Button>
                           </div>
                         )}
                       </div>
                     )}
 
                     {/* Hidden file input */}
                     <input
                       type="file"
                       ref={fileInputRef}
                       onChange={handleFileChange}
                       className="hidden"
                       accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                     />
 
                     {/* Document Checklist */}
                     {profile && (
                       <div className="bg-card rounded-2xl border border-border p-6">
                         <div className="flex items-center justify-between mb-4">
                           <h3 className="font-semibold flex items-center gap-2">
                             <CheckCircle2 className="w-5 h-5 text-primary" />
                             Чек-лист документов
                           </h3>
                           <Button
                             size="sm"
                             variant="outline"
                             className="gap-2"
                             disabled={isSendingReminder}
                             onClick={async () => {
                               if (!profile) return;
                               setIsSendingReminder(true);
                               try {
                                 const { error } = await safeInvoke<any>("send-documents-reminder", {
                                   body: { user_id: profile.user_id, organization_id: organizationId }
                                 });
                                 if (error) throw error;
                                 toast.success("Напоминание отправлено");
                               } catch (err) {
                                 toast.error("Ошибка отправки напоминания");
                               } finally {
                                 setIsSendingReminder(false);
                               }
                             }}
                           >
                             {isSendingReminder ? <SigmaSpinner size="sm" /> : <Bell className="w-4 h-4" />}
                             Напомнить о документах
                           </Button>
                         </div>
                         <div className="grid grid-cols-3 gap-3">
                           {checklistItems.map((item) => {
                             const isUploading = uploadingType === item.uploadType;
                             
                             return (
                               <div
                                 key={item.id}
                                  className={`p-4 rounded-xl border transition-colors flex flex-col items-center text-center ${
                                   item.completed
                                     ? "bg-green-500/10 border-green-500/30"
                                     : "bg-muted/50 border-border"
                                 }`}
                               >
                                  <div className="flex flex-col items-center gap-2">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                     item.completed ? "bg-green-500/20" : "bg-muted"
                                   }`}>
                                     {item.completed ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                                     ) : (
                                        <item.icon className="w-5 h-5 text-muted-foreground" />
                                     )}
                                   </div>
                                    <span className="text-sm font-medium">{item.label}</span>
                                   {item.uploadable && !item.completed && (
                                     <Button
                                       size="sm"
                                       variant="ghost"
                                        className="h-7 gap-1 text-xs"
                                       onClick={() => handleUploadClick(item.uploadType!)}
                                       disabled={isUploading}
                                     >
                                       {isUploading ? (
                                         <SigmaSpinner size="sm" />
                                       ) : (
                                          <>
                                            <Upload className="w-3 h-3" />
                                            Загрузить
                                          </>
                                       )}
                                     </Button>
                                   )}
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     )}
                   </TabsContent>
 
                   {/* Identification Tab */}
                   <TabsContent value="identification" className="m-0 space-y-6">
                     {!profile ? (
                       <div className="text-center py-12 text-muted-foreground">
                         <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                         <p>Сначала создайте учётную запись</p>
                       </div>
                     ) : (
                       <>
                         <div className="bg-card rounded-2xl border border-border p-6">
                           <h3 className="font-semibold mb-4 flex items-center gap-2">
                             <Video className="w-5 h-5 text-primary" />
                             Журнал идентификации личности
                           </h3>
                           
                           {verifications.length === 0 ? (
                             <div className="text-center py-8 text-muted-foreground">
                               <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                               <p>Идентификация не пройдена</p>
                             </div>
                           ) : (
                             <div className="space-y-4">
                               {verifications.map((v) => (
                                 <div key={v.id} className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                                   {v.photo_url && (
                                     <img
                                       src={v.photo_url}
                                       alt="Verification"
                                       className="w-20 h-20 rounded-xl object-cover"
                                     />
                                   )}
                                   <div className="flex-1">
                                     <div className="flex items-center gap-2 mb-2">
                                       {getStatusBadge(v.status)}
                                       <span className="text-xs text-muted-foreground">
                                         {formatDate(v.created_at)}
                                       </span>
                                     </div>
                                     {v.verified_at && (
                                       <p className="text-sm text-muted-foreground">
                                         Проверено: {formatDate(v.verified_at)}
                                       </p>
                                     )}
                                     {v.rejection_reason && (
                                       <p className="text-sm text-destructive mt-1">
                                         Причина: {v.rejection_reason}
                                       </p>
                                     )}
                                   </div>
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
 
                         <div className="bg-card rounded-2xl border border-border p-6">
                           <div className="flex items-center justify-between">
                             <div className="flex items-center gap-3">
                               <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                 latestVerification?.status === "verified" ? "bg-green-500/10" : "bg-muted"
                               }`}>
                                 {latestVerification?.status === "verified" ? (
                                   <CheckCircle2 className="w-5 h-5 text-green-500" />
                                 ) : (
                                   <Video className="w-5 h-5 text-muted-foreground" />
                                 )}
                               </div>
                               <div>
                                 <Label className="font-medium cursor-pointer">
                                   Видеоидентификация пройдена
                                 </Label>
                                 <p className="text-xs text-muted-foreground">
                                   Отметить вручную
                                 </p>
                               </div>
                             </div>
                             <Checkbox
                               checked={latestVerification?.status === "verified"}
                               onCheckedChange={(checked) => handleManualVerification(!!checked)}
                               className="h-5 w-5"
                             />
                           </div>
                         </div>
                       </>
                     )}
                   </TabsContent>
 
                   {/* Courses Tab */}
                   <TabsContent value="courses" className="m-0 space-y-4">
                     {!profile ? (
                       <div className="text-center py-12 text-muted-foreground">
                         <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                         <p>Сначала создайте учётную запись</p>
                       </div>
                     ) : (
                       <div className="bg-card rounded-2xl border border-border p-6">
                         <div className="flex items-center justify-between mb-4">
                           <h3 className="font-semibold flex items-center gap-2">
                             <BookOpen className="w-5 h-5 text-primary" />
                             Курсы ({enrollments.length})
                           </h3>
                           {coursesToEnroll.length > 0 && (
                             <Button
                               size="sm"
                               variant="outline"
                               onClick={() => setIsAddingCourse(!isAddingCourse)}
                             >
                               <Plus className="w-4 h-4 mr-1" />
                               Зачислить
                             </Button>
                           )}
                         </div>
 
                         {isAddingCourse && (
                            <div className="mb-4 p-3 rounded-lg bg-muted/50 space-y-3">
                              <div className="text-sm text-muted-foreground mb-2">
                                Выберите курсы для зачисления:
                              </div>
                              <div className="max-h-48 overflow-y-auto space-y-2">
                                {coursesToEnroll.map(c => (
                                  <div
                                    key={c.id}
                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                      selectedCourseIds.includes(c.id)
                                        ? "bg-primary/10"
                                        : "hover:bg-muted"
                                    }`}
                                    onClick={() => {
                                      setSelectedCourseIds(prev =>
                                        prev.includes(c.id)
                                          ? prev.filter(id => id !== c.id)
                                          : [...prev, c.id]
                                      );
                                    }}
                                  >
                                    <Checkbox
                                      checked={selectedCourseIds.includes(c.id)}
                                      onCheckedChange={(checked) => {
                                        setSelectedCourseIds(prev =>
                                          checked
                                            ? [...prev, c.id]
                                            : prev.filter(id => id !== c.id)
                                        );
                                      }}
                                    />
                                    <span className="text-sm">{c.title}</span>
                                  </div>
                                ))}
                              </div>
                              {selectedCourseIds.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  Выбрано: {selectedCourseIds.length}
                                </div>
                              )}
                              <div className="flex justify-end">
                             <Button
                               size="sm"
                               onClick={handleEnrollToCourse}
                                disabled={selectedCourseIds.length === 0 || isEnrolling}
                             >
                                {isEnrolling ? (
                                  <SigmaSpinner size="sm" className="mr-1" />
                                ) : (
                                  <GraduationCap className="w-4 h-4 mr-1" />
                                )}
                                Зачислить ({selectedCourseIds.length})
                             </Button>
                              </div>
                           </div>
                         )}
 
                         {enrollments.length === 0 ? (
                           <div className="text-center py-8 text-muted-foreground">
                             <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                             <p>Нет назначенных курсов</p>
                           </div>
                         ) : (
                           <div className="space-y-3">
                             {enrollments.map((e) => (
                               <div key={e.id} className="p-4 rounded-xl bg-muted/50">
                                 <div className="flex items-center justify-between mb-2">
                                   <div className="font-medium">{e.course_title}</div>
                                   <div className="flex items-center gap-2">
                                     {getStatusBadge(e.status)}
                                     {e.progress > 0 && (
                                       <Button
                                         size="icon"
                                         variant="ghost"
                                         className="h-7 w-7"
                                         onClick={() => handleResetProgress(e.id, e.course_id)}
                                         title="Сбросить прогресс"
                                       >
                                         <RotateCcw className="w-4 h-4" />
                                       </Button>
                                     )}
                                     <Button
                                       size="icon"
                                       variant="ghost"
                                       className="h-7 w-7 text-destructive hover:text-destructive"
                                       onClick={() => handleRemoveEnrollment(e.id)}
                                       title="Отчислить"
                                     >
                                       <Trash2 className="w-4 h-4" />
                                     </Button>
                                   </div>
                                 </div>
                                 <div className="flex items-center gap-3">
                                   <Progress value={e.progress} className="flex-1 h-2" />
                                   <span className="text-sm text-muted-foreground">{Math.min(e.progress, 100)}%</span>
                                 </div>
                                 <div className="text-xs text-muted-foreground mt-2">
                                   Начало: {format(new Date(e.started_at), "dd.MM.yyyy", { locale: ru })}
                                   {e.completed_at && (
                                     <span className="text-green-600 ml-2">
                                       • Завершён: {format(new Date(e.completed_at), "dd.MM.yyyy", { locale: ru })}
                                     </span>
                                   )}
                                 </div>
                               </div>
                             ))}
                           </div>
                         )}
                       </div>
                     )}
                   </TabsContent>
 
                   {/* Documents Tab */}
                   <TabsContent value="documents" className="m-0 space-y-4">
                     {!profile ? (
                       <div className="text-center py-12 text-muted-foreground">
                         <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                         <p>Сначала создайте учётную запись</p>
                       </div>
                     ) : (
                       <div className="bg-card rounded-2xl border border-border p-6">
                         <h3 className="font-semibold mb-4 flex items-center gap-2">
                           <FileText className="w-5 h-5 text-primary" />
                           Документы личности
                         </h3>
                         
                         {identityDocs.length === 0 ? (
                           <div className="text-center py-8 text-muted-foreground">
                             <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                             <p>Нет загруженных документов</p>
                           </div>
                         ) : (
                           <div className="space-y-3">
                             {identityDocs.map((d) => (
                               <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                                 <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                     <FileText className="w-5 h-5 text-primary" />
                                   </div>
                                   <div>
                                     <div className="font-medium">{d.name}</div>
                                     <div className="text-xs text-muted-foreground">
                                       {formatDate(d.created_at)}
                                     </div>
                                   </div>
                                 </div>
                                 {d.file_url && (
                                   <div className="flex gap-1">
                                     <Button
                                       variant="ghost"
                                       size="icon"
                                       onClick={() => openPrivateFile("student-documents", d.file_url!)}
                                       title="Открыть"
                                     >
                                       <Eye className="w-4 h-4" />
                                     </Button>
                                     <Button
                                       variant="ghost"
                                       size="icon"
                                       className="text-destructive hover:text-destructive"
                                       onClick={() => handleDeleteDoc(d)}
                                       title="Удалить"
                                     >
                                       <Trash2 className="w-4 h-4" />
                                     </Button>
                                   </div>
                                 )}
                               </div>
                             ))}
                           </div>
                         )}
                       </div>
                     )}
                   </TabsContent>
                 </>
               )}
             </div>
           </ScrollArea>
         </Tabs>
       </DialogContent>
     </Dialog>
   );
 }