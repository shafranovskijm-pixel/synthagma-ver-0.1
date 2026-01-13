import { CoursesTab } from "./CoursesTab";
import { StatsCards } from "./StatsCards";
import { DocumentsStatsCards } from "./DocumentsStatsCards";
import { StudentsTab } from "./StudentsTab";
import { SettingsTab } from "./SettingsTab";
import { LinksTab } from "./LinksTab";
import { StatsTab } from "./StatsTab";
import { DocumentsTab } from "./DocumentsTab";
import { CompaniesManager } from "@/components/organization/CompaniesManager";
import { LibraryManager } from "@/components/organization/LibraryManager";
import { CourseStoreManager } from "@/components/organization/CourseStoreManager";
import { FRDOManager } from "@/components/organization/FRDOManager";
import { JournalsManager } from "@/components/organization/JournalsManager";
import type { TabType } from "../OrgSidebar";
import type { OrganizationStats, DocumentsStats, Course, MenuSettings } from "@/types";

export interface BrandingSettings {
  coverUrl: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  showOrgName: boolean;
}

export interface StudentDashboardSettings {
  showLibrary: boolean;
  showAchievements: boolean;
  showAiChat: boolean;
}

interface TabContentRendererProps {
  activeTab: TabType;
  organizationId: string | null;
  organizationName: string;
  userId?: string;
  stats: OrganizationStats;
  documentsStats: DocumentsStats;
  courses: Course[];
  studentDocsByUser: Map<string, string[]>;
  
  // Callbacks
  onOpenCourseDetails: (course: Course) => void;
  onShowBulkUploadDialog: () => void;
  setActiveTab: (tab: TabType) => void;
  onCreateLinkClick: () => void;
  onCoursesDeleted?: () => void;
  
  // Student tab props
  onViewStudent: (student: any) => void;
  onCopyCredentials: (login: string, password: string) => void;
  onBulkCreateCredentials?: (userIds: string[]) => Promise<void>;
  onBulkSendCredentials?: (userIds: string[]) => Promise<void>;
  onBulkSendDocReminders?: () => Promise<void>;
  onShowEnrollDialog?: (selectedIds: string[]) => void;
  onShowUnenrollConfirm?: (selectedIds: string[]) => void;
  onShowBulkFRDOExport?: (selectedIds: string[]) => void;
  isCreatingBulkCredentials: boolean;
  isSendingBulkCredentials: boolean;
  isSendingBulkDocReminders: boolean;
  
  // Settings props
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  menuSettings: MenuSettings;
  setMenuSettings: React.Dispatch<React.SetStateAction<MenuSettings>>;
  studentDashboardSettings: StudentDashboardSettings;
  setStudentDashboardSettings: React.Dispatch<React.SetStateAction<StudentDashboardSettings>>;
  brandingSettings: BrandingSettings;
  setBrandingSettings: React.Dispatch<React.SetStateAction<BrandingSettings>>;
  isSavingSettings: boolean;
  setIsSavingSettings: (v: boolean) => void;
  isSavingBranding: boolean;
  onSaveBranding: () => Promise<void>;
  onCoverUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingCover: boolean;
  isUploadingLogo: boolean;
  onPreviewStudentDashboard: () => void;
}

export function TabContentRenderer({
  activeTab,
  organizationId,
  organizationName,
  userId,
  stats,
  documentsStats,
  courses,
  studentDocsByUser,
  onOpenCourseDetails,
  onShowBulkUploadDialog,
  setActiveTab,
  onCoursesDeleted,
  onCreateLinkClick,
  onViewStudent,
  onCopyCredentials,
  onBulkCreateCredentials,
  onBulkSendCredentials,
  onBulkSendDocReminders,
  onShowEnrollDialog,
  onShowUnenrollConfirm,
  onShowBulkFRDOExport,
  isCreatingBulkCredentials,
  isSendingBulkCredentials,
  isSendingBulkDocReminders,
  isDarkMode,
  setIsDarkMode,
  menuSettings,
  setMenuSettings,
  studentDashboardSettings,
  setStudentDashboardSettings,
  brandingSettings,
  setBrandingSettings,
  isSavingSettings,
  setIsSavingSettings,
  isSavingBranding,
  onSaveBranding,
  onCoverUpload,
  onLogoUpload,
  isUploadingCover,
  isUploadingLogo,
  onPreviewStudentDashboard,
}: TabContentRendererProps) {
  const shouldShowStatsCards = activeTab !== "organizations" && 
    activeTab !== "services" && 
    activeTab !== "settings" && 
    activeTab !== "students" && 
    activeTab !== "frdo" && 
    activeTab !== "library" && 
    activeTab !== "journals" && 
    !activeTab.startsWith("documents");

  return (
    <>
      {/* Stats cards */}
      {shouldShowStatsCards && <StatsCards stats={stats} />}
      {activeTab === "students" && <DocumentsStatsCards stats={documentsStats} />}

      {/* Courses Tab */}
      {activeTab === "courses" && organizationId && (
        <CoursesTab 
          organizationId={organizationId} 
          onOpenCourseDetails={onOpenCourseDetails}
          onCoursesDeleted={onCoursesDeleted}
        />
      )}

      {/* Organizations/Companies Tab */}
      {activeTab === "organizations" && organizationId && (
        <CompaniesManager organizationId={organizationId} />
      )}

      {/* Students Tab */}
      {activeTab === "students" && organizationId && (
        <StudentsTab
          organizationId={organizationId}
          courses={courses}
          studentDocsByUser={studentDocsByUser}
          onViewStudent={onViewStudent}
          onCopyCredentials={onCopyCredentials}
          onBulkCreateCredentials={onBulkCreateCredentials}
          onBulkSendCredentials={onBulkSendCredentials}
          onBulkSendDocReminders={onBulkSendDocReminders}
          onShowEnrollDialog={onShowEnrollDialog}
          onShowUnenrollConfirm={onShowUnenrollConfirm}
          onShowBulkFRDOExport={onShowBulkFRDOExport}
          isCreatingBulkCredentials={isCreatingBulkCredentials}
          isSendingBulkCredentials={isSendingBulkCredentials}
          isSendingBulkDocReminders={isSendingBulkDocReminders}
        />
      )}

      {/* Stats Tab */}
      {activeTab === "stats" && organizationId && (
        <StatsTab organizationId={organizationId} stats={stats} />
      )}

      {/* Links Tab */}
      {activeTab === "links" && organizationId && (
        <LinksTab 
          organizationId={organizationId} 
          onCreateLinkClick={onCreateLinkClick} 
        />
      )}

      {/* Library Tab */}
      {activeTab === "library" && organizationId && (
        <LibraryManager organizationId={organizationId} />
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && organizationId && (
        <DocumentsTab 
          organizationId={organizationId} 
          onShowBulkUploadDialog={onShowBulkUploadDialog}
        />
      )}

      {/* Journals Tab */}
      {activeTab === "journals" && organizationId && (
        <JournalsManager organizationId={organizationId} />
      )}

      {/* FRDO Tab */}
      {activeTab === "frdo" && organizationId && (
        <FRDOManager organizationId={organizationId} />
      )}

      {/* Course Store Tab */}
      {activeTab === "services" && organizationId && (
        <CourseStoreManager organizationId={organizationId} userId={userId} />
      )}


      {/* Settings Tab */}
      {activeTab === "settings" && (
        <SettingsTab
          organizationId={organizationId}
          organizationName={organizationName}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          menuSettings={menuSettings}
          setMenuSettings={setMenuSettings}
          studentDashboardSettings={studentDashboardSettings}
          setStudentDashboardSettings={setStudentDashboardSettings}
          brandingSettings={brandingSettings}
          setBrandingSettings={setBrandingSettings}
          isSavingSettings={isSavingSettings}
          setIsSavingSettings={setIsSavingSettings}
          isSavingBranding={isSavingBranding}
          onSaveBranding={onSaveBranding}
          onCoverUpload={onCoverUpload}
          onLogoUpload={onLogoUpload}
          isUploadingCover={isUploadingCover}
          isUploadingLogo={isUploadingLogo}
          onPreviewStudentDashboard={onPreviewStudentDashboard}
        />
      )}
    </>
  );
}
