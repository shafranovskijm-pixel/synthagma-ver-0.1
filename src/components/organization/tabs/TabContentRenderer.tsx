import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { OrgProfileTab as ProfileTab } from "@/components/organization/tabs/OrgProfileTab";
import { OrgSettingsContent } from "@/components/organization/tabs/OrgSettingsContent";
import { WhatsNewTab } from "@/components/organization/tabs/WhatsNewTab";
import { OrgDocumentsTab } from "@/components/organization/tabs/OrgDocumentsTab";
import { ContractEditorTab } from "@/components/organization/tabs/ContractEditorTab";
import { GroupFolderTab } from "@/components/organization/tabs/GroupFolderTab";
import { OrganizationHomeTab } from "@/components/organization/tabs/OrganizationHomeTab";

import { OrgSecondaryNavTabs } from "@/components/organization/OrgSecondaryNavTabs";
import { OrgSalesManager } from "@/components/organization/sales/OrgSalesManager";

import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { getDirectDocumentWorkspacePermission } from "@/lib/organization/documentNavigationPermissions";

export function TabContentRenderer() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  const activeTab = d.tabNavigation.activeTab;
  const organizationId = d.organizationId;
  const [searchParams] = useSearchParams();
  const { can, loading: permissionsLoading } = useStaffPermissions();
  // Контекст группы для Журналов и ФИС ФРДО (передаётся из папки группы)
  const ctxGroupId = searchParams.get("groupId");
  const ctxCourseId = searchParams.get("courseId");
  const ctxReturnToGroupId = searchParams.get("returnToGroupId");

  useEffect(() => {
    if (activeTab === "ai-tutors" || activeTab === "webinars") {
      d.tabNavigation.setActiveTab("courses" as any);
    }
  }, [activeTab, d.tabNavigation]);

  const shouldShowStatsCards = activeTab !== "organizations" && 
    activeTab !== "home" &&
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
    activeTab !== "ai-tutors" &&
    activeTab !== "staff" &&
    activeTab !== "webinars" &&
    activeTab !== "sales" &&
    activeTab !== "profile" &&
    activeTab !== "settings" &&
    activeTab !== "whats-new" &&
    activeTab !== "org-documents" &&
    !activeTab.startsWith("documents") &&
    activeTab !== "course-details" &&
    activeTab !== "contract-editor" &&
    activeTab !== "student-details" &&
    activeTab !== "group-folder";

  const directDocumentPermission = getDirectDocumentWorkspacePermission(activeTab);

  if (directDocumentPermission && permissionsLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground" role="status">
        Проверка доступа…
      </div>
    );
  }

  if (directDocumentPermission && !can(directDocumentPermission)) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-8 text-center"
        role="alert"
        data-testid="document-workspace-permission-denied"
      >
        <h2 className="font-semibold">Нет доступа к разделу</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Обратитесь к администратору организации, чтобы получить нужное право.
        </p>
      </div>
    );
  }


  return (
    <>
      {activeTab === "home" && <OrganizationHomeTab />}

      {/* Stats cards */}
      {shouldShowStatsCards && (
        <StatsCards
          stats={d.stats}
          hasData={d.hasSummaryData}
          isLoading={d.isSummaryLoading}
          errorKind={d.summaryErrorKind}
          onRetry={d.retrySummary}
        />
      )}
      {activeTab === "students" && d.subscriptionLimits?.plan !== 'free' && (
        <DocumentsStatsCards
          stats={d.documentsStats}
          hasData={d.hasSummaryData}
          isLoading={d.isSummaryLoading}
          errorKind={d.summaryErrorKind}
          onRetry={d.retrySummary}
        />
      )}

      {/* Courses Tab */}
      {activeTab === "courses" && organizationId && (
        <CoursesTab 
          organizationId={organizationId} 
          onOpenCourseDetails={(course) => {
            d.tabNavigation.openCourseDetails(course.id);
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
          onViewStudent={d.handleViewStudent}
          onCopyCredentials={d.handleCopyCredentials}
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
          onShowUnenrollConfirm={(selectedUserIds, selectedEnrollmentIds) => {
            if (selectedUserIds && selectedUserIds.length > 0) {
              d.enrollmentActions.setSelectedStudentIds(new Set(selectedUserIds));
            }
            d.enrollmentActions.setSelectedEnrollmentIds(selectedEnrollmentIds || []);
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
              d.enrollmentActions.setSelectedStudentIds(new Set(selectedUserIds));
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
        <StatsTab
          organizationId={organizationId}
          stats={d.stats}
          hasData={d.hasSummaryData}
          isLoading={d.isSummaryLoading}
          errorKind={d.summaryErrorKind}
          onRetry={d.retrySummary}
        />
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
        <JournalsManager
          organizationId={organizationId}
          groupId={ctxGroupId}
          courseId={ctxCourseId}
          returnToGroupId={ctxReturnToGroupId}
        />
      )}

      {/* Labor Safety Tab */}
      {activeTab === "labor-safety" && organizationId && (
        <LaborSafetyManager organizationId={organizationId} />
      )}

      {/* FRDO Tab */}
      {activeTab === "frdo" && organizationId && (
        <FRDOManager
          organizationId={organizationId}
          groupId={ctxGroupId}
          courseId={ctxCourseId}
          returnToGroupId={ctxReturnToGroupId}
        />
      )}

      {/* Homework Review Tab */}
      {activeTab === "homework-review" && <HomeworkReviewTab />}

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

      {/* Sales Tab — единый «Кабинет менеджера» (КП/Договоры/Рассылки/SMTP + заглушки Сделок 360°/Задач) */}
      {activeTab === ("sales" as any) && organizationId && <OrgSalesManager />}

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

      {/* Group folder view (Windows-like) */}
      {activeTab === "group-folder" && organizationId && d.tabNavigation.selectedGroupId && (
        <GroupFolderTab organizationId={organizationId} groupId={d.tabNavigation.selectedGroupId} />
      )}

    </>
  );
}
