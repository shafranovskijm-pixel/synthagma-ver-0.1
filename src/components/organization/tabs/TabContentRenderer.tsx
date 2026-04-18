import { useNavigate } from "react-router-dom";
import { CoursesTab } from "./CoursesTab";
import { CourseDetailsTab } from "./CourseDetailsTab";
import { StudentDetailsTab } from "./StudentDetailsTab";
import { StatsCards } from "./StatsCards";
import { DocumentsStatsCards } from "./DocumentsStatsCards";
import { StudentsTab } from "./StudentsTab";

import { LinksTab } from "./LinksTab";
import { StatsTab } from "./StatsTab";
import { DocumentsTab } from "./DocumentsTab";
import { CompaniesManager } from "@/components/organization/CompaniesManager";
import { StorageManager } from "@/components/organization/StorageManager";
import { CourseStoreManager } from "@/components/organization/CourseStoreManager";
import { FRDOManager } from "@/components/organization/FRDOManager";
import { JournalsManager } from "@/components/organization/JournalsManager";
import { LaborSafetyManager } from "@/components/organization/LaborSafetyManager";
import { OrgChatsTab } from "@/components/organization/OrgChatsTab";
import { SubscriptionTab } from "@/components/organization/SubscriptionTab";
import { PaymentsTab } from "@/components/organization/PaymentsTab";
import { HomeworkReviewTab } from "@/components/organization/HomeworkReviewTab";
import { StaffManager } from "@/components/organization/StaffManager";
import { WebinarsManager } from "@/components/organization/WebinarsManager";
import { ProfileTab } from "@/components/organization/tabs/ProfileTab";
import { OrgSettingsContent } from "@/components/organization/tabs/OrgSettingsContent";
import { WhatsNewTab } from "@/components/organization/tabs/WhatsNewTab";
import { OrgDocumentsTab } from "@/components/organization/tabs/OrgDocumentsTab";
import { ContractEditorTab } from "@/components/organization/tabs/ContractEditorTab";
import { OrgSecondaryNavTabs } from "@/components/organization/OrgSecondaryNavTabs";

import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

export function TabContentRenderer() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  const activeTab = d.tabNavigation.activeTab;
  const organizationId = d.organizationId;

  const shouldShowStatsCards = activeTab !== "organizations" && 
    activeTab !== "services" && 
     
    activeTab !== "students" && 
    activeTab !== "frdo" && 
    activeTab !== "library" && 
    activeTab !== "journals" && 
    activeTab !== "labor-safety" &&
    activeTab !== "subscription" &&
    activeTab !== "payments" &&
    activeTab !== "chats" &&
    activeTab !== "courses" &&
    activeTab !== "homework-review" &&
    activeTab !== "staff" &&
    activeTab !== "webinars" &&
    activeTab !== "profile" &&
    activeTab !== "settings" &&
    activeTab !== "whats-new" &&
    activeTab !== "org-documents" &&
    !activeTab.startsWith("documents") &&
    activeTab !== "course-details" &&
    activeTab !== "contract-editor" &&
    activeTab !== "student-details";

  return (
    <>
      {/* Stats cards */}
      {shouldShowStatsCards && <StatsCards stats={d.stats} />}
      {activeTab === "students" && d.subscriptionLimits?.plan !== 'free' && <DocumentsStatsCards stats={d.documentsStats} />}

      {/* Courses Tab */}
      {activeTab === "courses" && organizationId && (
        <CoursesTab 
          organizationId={organizationId} 
          onOpenCourseDetails={(course) => {
            d.tabNavigation.setSelectedCourseId(course.id);
            d.tabNavigation.setActiveTab("course-details");
          }}
          onCoursesDeleted={d.refreshData}
        />
      )}

      {/* Course Details Tab */}
      {activeTab === "course-details" && <CourseDetailsTab />}

      {/* Organizations/Companies Tab */}
      {activeTab === "organizations" && organizationId && (
        <CompaniesManager organizationId={organizationId} />
      )}

      {/* Chats Tab */}
      {activeTab === "chats" && <OrgChatsTab />}

      {/* Students Tab */}
      {activeTab === "students" && organizationId && (
        <StudentsTab
          organizationId={organizationId}
          courses={d.courses}
          studentDocsByUser={d.studentDocsByUser}
          onViewStudent={d.handleViewStudent}
          onCopyCredentials={d.studentDetailsDialog.handleCopyCredentials}
          onBulkCreateCredentials={d.handleBulkCreateCredentials}
          onBulkSendCredentials={d.handleBulkSendCredentials}
          onBulkSendDocReminders={d.studentActions.bulkSendDocReminders}
          onShowEnrollDialog={(selectedIds) => {
            if (selectedIds && selectedIds.length > 0) {
              d.enrollmentActions.setSelectedStudentIds(new Set(selectedIds));
            }
            if (d.studentCourseFilter !== "all") d.enrollmentActions.setEnrollCourseId(d.studentCourseFilter);
            d.enrollmentActions.setShowEnrollDialog(true);
          }}
          onShowUnenrollConfirm={(selectedIds) => {
            if (selectedIds && selectedIds.length > 0) {
              d.enrollmentActions.setSelectedStudentIds(new Set(selectedIds));
            }
            d.enrollmentActions.setShowUnenrollConfirm(true);
          }}
          onShowBulkFRDOExport={(selectedIds) => {
            if (selectedIds && selectedIds.length > 0) {
              d.enrollmentActions.setSelectedStudentIds(new Set(selectedIds));
            }
            d.enrollmentActions.setShowBulkFRDOExport(true);
          }}
          onShowBulkDeleteConfirm={(selectedUserIds) => {
            if (selectedUserIds && selectedUserIds.length > 0) {
              const selectionIds = d.students.filter(s => selectedUserIds.includes(s.user_id))
                .map(s => s.enrollment_id || s.user_id);
              d.enrollmentActions.setSelectedStudentIds(new Set(selectionIds));
            }
            d.enrollmentActions.setShowBulkDeleteConfirm(true);
          }}
          isCreatingBulkCredentials={d.studentActions.isCreatingBulkCredentials}
          isSendingBulkCredentials={d.studentActions.isSendingBulkCredentials}
          isSendingBulkDocReminders={d.studentActions.isSendingBulkDocReminders}
          onAddStudent={() => d.studentManagement.setShowAddStudentDialog(true)}
          onImportStudents={() => d.setShowImportDialog(true)}
          onNavigateToFRDO={() => d.tabNavigation.setActiveTab("frdo" as any)}
        />
      )}

      {/* Stats Tab */}
      {activeTab === "stats" && organizationId && (
        <StatsTab organizationId={organizationId} stats={d.stats} />
      )}

      {/* Links Tab */}
      {activeTab === "links" && organizationId && (
        <LinksTab 
          organizationId={organizationId} 
          onCreateLinkClick={() => d.registrationLinks.setShowCreateLinkDialog(true)} 
        />
      )}

      {/* Storage Tab */}
      {activeTab === "library" && organizationId && (
        <StorageManager organizationId={organizationId} />
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && organizationId && (
        <DocumentsTab 
          organizationId={organizationId}
          organizationName={d.organizationName}
          onShowBulkUploadDialog={() => d.setShowBulkUploadDialog(true)}
          onNavigateToSubscription={() => d.tabNavigation.setActiveTab('subscription')}
        />
      )}

      {/* Journals Tab */}
      {activeTab === "journals" && organizationId && (
        <JournalsManager organizationId={organizationId} />
      )}

      {/* Labor Safety Tab */}
      {activeTab === "labor-safety" && organizationId && (
        <LaborSafetyManager organizationId={organizationId} />
      )}

      {/* FRDO Tab */}
      {activeTab === "frdo" && organizationId && (
        <FRDOManager organizationId={organizationId} />
      )}

      {/* Homework Review Tab */}
      {activeTab === "homework-review" && <HomeworkReviewTab />}

      {/* Webinars Tab */}
      {activeTab === "webinars" && organizationId && (
        <WebinarsManager organizationId={organizationId} />
      )}

      {/* Staff Tab */}
      {activeTab === ("staff" as any) && organizationId && (
        <StaffManager organizationId={organizationId} />
      )}

      {/* Course Store Tab */}
      {activeTab === "services" && organizationId && (
        <CourseStoreManager
          organizationId={organizationId}
          userId={d.user?.id}
        />
      )}

      {/* Payments Tab */}
      {activeTab === "payments" && <PaymentsTab />}

      {/* Subscription Tab */}
      {activeTab === "subscription" && <SubscriptionTab />}

      {/* Secondary nav (duplicates the avatar dropdown) for profile/documents/whats-new */}
      {(activeTab === "profile" ||
        activeTab === "settings" ||
        activeTab === "org-documents" ||
        activeTab === "whats-new") && <OrgSecondaryNavTabs embedded />}

      {/* Profile Tab */}
      {activeTab === "profile" && organizationId && (
        <ProfileTab organizationId={organizationId} />
      )}

      {/* Settings Tab — раздел удалён, перенаправляем на профиль (раздел «Разделы меню») */}
      {activeTab === "settings" && organizationId && (
        <ProfileTab organizationId={organizationId} initialSubTab="menu" />
      )}

      {/* What's New Tab */}
      {activeTab === "whats-new" && <WhatsNewTab />}

      {/* Org Documents Tab (profile section) */}
      {activeTab === "org-documents" && organizationId && (
        <OrgDocumentsTab organizationId={organizationId} />
      )}

      {/* Contract Template Editor Tab */}
      {activeTab === "contract-editor" && organizationId && (
        <ContractEditorTab organizationId={organizationId} organizationName={d.organizationName || ""} />
      )}

      {/* Student Details Tab */}
      {activeTab === "student-details" && <StudentDetailsTab />}
    </>
  );
}
