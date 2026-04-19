import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { protectedRoute, LearningRedirect } from "./helpers";

const StudentDashboard = lazyWithRetry(() => import("@/pages/StudentDashboard"));
const StudentProfile = lazyWithRetry(() => import("@/pages/StudentProfile"));
const StudentWhatsNew = lazyWithRetry(() => import("@/pages/StudentWhatsNew"));
const CourseLearning = lazyWithRetry(() => import("@/pages/CourseLearning"));
const InvoiceView = lazyWithRetry(() => import("@/pages/InvoiceView"));
const WebinarLive = lazyWithRetry(() => import("@/pages/WebinarLive"));
const AITutor = lazyWithRetry(() => import("@/pages/AITutor"));

export const studentRoutes = (
  <>
    <Route path="/student" element={protectedRoute(<StudentDashboard />)} />
    <Route path="/student/profile" element={protectedRoute(<StudentProfile />)} />
    <Route path="/student/whats-new" element={protectedRoute(<StudentWhatsNew />)} />
    <Route path="/course/:courseId/learn" element={protectedRoute(<CourseLearning />)} />
    <Route path="/learning/:courseId" element={<LearningRedirect />} />
    <Route path="/invoice/:id" element={protectedRoute(<InvoiceView />)} />
    <Route path="/webinar/:id/live" element={protectedRoute(<WebinarLive />)} />
    <Route path="/webinar/ai-tutor/live" element={protectedRoute(<WebinarLive />)} />
    <Route path="/ai-tutor" element={protectedRoute(<AITutor />)} />
  </>
);
