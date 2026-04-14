import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { protectedRoute } from "./helpers";

const OrganizationDashboard = lazyWithRetry(() => import("@/pages/OrganizationDashboard"));
const OrganizationProfile = lazyWithRetry(() => import("@/pages/OrganizationProfile"));
const OrganizationSettings = lazyWithRetry(() => import("@/pages/OrganizationSettings"));
const OrganizationDocuments = lazyWithRetry(() => import("@/pages/OrganizationDocuments"));
const OrganizationCourseDetails = lazyWithRetry(() => import("@/pages/OrganizationCourseDetails"));
const OrganizationWhatsNew = lazyWithRetry(() => import("@/pages/OrganizationWhatsNew"));
const OrganizationHelp = lazyWithRetry(() => import("@/pages/OrganizationHelp"));
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
    <Route path="/organization" element={protectedRoute(<OrganizationDashboard />, org)} />
    <Route path="/organization/profile" element={protectedRoute(<OrganizationProfile />, org)} />
    <Route path="/organization/settings" element={protectedRoute(<OrganizationSettings />, org)} />
    <Route path="/organization/documents" element={protectedRoute(<OrganizationDocuments />, org)} />
    <Route path="/organization/course/:courseId" element={protectedRoute(<OrganizationCourseDetails />, org)} />
    <Route path="/organization/whats-new" element={protectedRoute(<OrganizationWhatsNew />, org)} />
    <Route path="/organization/help" element={protectedRoute(<OrganizationHelp />, org)} />
    <Route path="/organization/student/:studentId" element={protectedRoute(<OrganizationStudentDetails />, org)} />
    <Route path="/course/:courseId/edit" element={protectedRoute(<CourseEditor />, org)} />
    <Route path="/course-builder" element={protectedRoute(<CourseBuilder />, org)} />
    <Route path="/course-builder/:courseId" element={protectedRoute(<CourseBuilder />, org)} />
    <Route path="/course-preview/:courseId" element={protectedRoute(<CoursePreview />, org)} />
    <Route path="/course/:courseId/landing-editor" element={protectedRoute(<CourseLandingEditor />, org)} />
    <Route path="/course-import" element={protectedRoute(<CourseImport />, org)} />
    <Route path="/contract-editor" element={protectedRoute(<ContractEditor />, org)} />
  </>
);
