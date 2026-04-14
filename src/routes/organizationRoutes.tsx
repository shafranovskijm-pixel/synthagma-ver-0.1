import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { protectedRoute } from "./helpers";

const OrgLayout = lazyWithRetry(() => import("@/components/organization/OrgLayout"));
const OrganizationDashboard = lazyWithRetry(() => import("@/pages/OrganizationDashboard"));
const OrganizationProfile = lazyWithRetry(() => import("@/pages/OrganizationProfile"));
const OrganizationSettings = lazyWithRetry(() => import("@/pages/OrganizationSettings"));
const OrganizationDocuments = lazyWithRetry(() => import("@/pages/OrganizationDocuments"));
const OrganizationCourseDetails = lazyWithRetry(() => import("@/pages/OrganizationCourseDetails"));
const OrganizationWhatsNew = lazyWithRetry(() => import("@/pages/OrganizationWhatsNew"));

const OrganizationStudentDetails = lazyWithRetry(() => import("@/pages/OrganizationStudentDetails"));
const CourseEditor = lazyWithRetry(() => import("@/pages/CourseEditor"));
const CourseBuilder = lazyWithRetry(() => import("@/pages/CourseBuilder"));
const CoursePreview = lazyWithRetry(() => import("@/pages/CoursePreview"));
const CourseLandingEditor = lazyWithRetry(() => import("@/pages/CourseLandingEditor"));
const CourseImport = lazyWithRetry(() => import("@/pages/CourseImport"));
const ContractEditor = lazyWithRetry(() => import("@/pages/ContractEditor"));

const org = "organization";

export const organizationRoutes = (
  <>
    {/* All /organization/* routes share a single OrgDashboardProvider via OrgLayout */}
    <Route path="/organization" element={protectedRoute(<OrgLayout />, org)}>
      <Route index element={<OrganizationDashboard />} />
      <Route path="profile" element={<OrganizationProfile />} />
      <Route path="settings" element={<OrganizationSettings />} />
      <Route path="documents" element={<OrganizationDocuments />} />
      <Route path="course/:courseId" element={<OrganizationCourseDetails />} />
      <Route path="whats-new" element={<OrganizationWhatsNew />} />
      <Route path="student/:studentId" element={<OrganizationStudentDetails />} />
    </Route>

    {/* These routes have their own layout, not nested under /organization */}
    <Route path="/course/:courseId/edit" element={protectedRoute(<CourseEditor />, org)} />
    <Route path="/course-builder" element={protectedRoute(<CourseBuilder />, org)} />
    <Route path="/course-builder/:courseId" element={protectedRoute(<CourseBuilder />, org)} />
    <Route path="/course-preview/:courseId" element={protectedRoute(<CoursePreview />, org)} />
    <Route path="/course/:courseId/landing-editor" element={protectedRoute(<CourseLandingEditor />, org)} />
    <Route path="/course-import" element={protectedRoute(<CourseImport />, org)} />
    <Route path="/contract-editor" element={protectedRoute(<ContractEditor />, org)} />
  </>
);
