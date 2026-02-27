import { lazy, Suspense } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LazyLoadFallback } from "@/components/LazyLoadFallback";
import { ScrollToTop } from "./components/ScrollToTop";

// Lazy-loaded pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const BrandedLogin = lazy(() => import("./pages/BrandedLogin"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const RegisterOrganization = lazy(() => import("./pages/RegisterOrganization"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const OrganizationDashboard = lazy(() => import("./pages/OrganizationDashboard"));
const CourseEditor = lazy(() => import("./pages/CourseEditor"));
const CourseBuilder = lazy(() => import("./pages/CourseBuilder"));
const CourseLearning = lazy(() => import("./pages/CourseLearning"));
const CoursePreview = lazy(() => import("./pages/CoursePreview"));
const JoinByLink = lazy(() => import("./pages/JoinByLink"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const SalesDashboard = lazy(() => import("./pages/SalesDashboard"));
const Features = lazy(() => import("./pages/Features"));
const CourseImport = lazy(() => import("./pages/CourseImport"));
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Install = lazy(() => import("./pages/Install"));
const FeatureFRDO = lazy(() => import("./pages/FeatureFRDO"));
const FeatureDocuments = lazy(() => import("./pages/FeatureDocuments"));
const FeatureVideoId = lazy(() => import("./pages/FeatureVideoId"));
const FeatureLaborSafety = lazy(() => import("./pages/FeatureLaborSafety"));
const FeatureCourseStore = lazy(() => import("./pages/FeatureCourseStore"));
const FeatureDocumentChecklist = lazy(() => import("./pages/FeatureDocumentChecklist"));
const FeatureCourseSettings = lazy(() => import("./pages/FeatureCourseSettings"));
const FeatureBranding = lazy(() => import("./pages/FeatureBranding"));
const FeatureAICourses = lazy(() => import("./pages/FeatureAICourses"));
const RoadmapPage = lazy(() => import("./pages/RoadmapPage"));
const CompanyDashboard = lazy(() => import("./pages/CompanyDashboard"));
const PublicOffer = lazy(() => import("./pages/PublicOffer"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const PersonalDataPolicy = lazy(() => import("./pages/PersonalDataPolicy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ProposalPublic = lazy(() => import("./pages/ProposalPublic"));
const ContractEditor = lazy(() => import("./pages/ContractEditor"));

const queryClient = new QueryClient();

const LearningRedirect = () => { const { courseId } = useParams(); return <Navigate to={`/course/${courseId}/learn`} replace />; };

const isNative = typeof (window as any).Capacitor !== 'undefined';
const Router = isNative ? HashRouter : BrowserRouter;

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <QueryClientProvider client={queryClient}>
          <Router>
            <AuthProvider>
              <ScrollToTop />
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <Suspense fallback={<LazyLoadFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/login/:slug" element={<BrandedLogin />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/register" element={<RegisterOrganization />} />
                    <Route path="/register-organization" element={<RegisterOrganization />} />
                    <Route path="/student" element={
                      <ProtectedRoute>
                        <StudentDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/organization" element={
                      <ProtectedRoute requiredRole="organization">
                        <OrganizationDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/course/:courseId/edit" element={
                      <ProtectedRoute requiredRole="organization">
                        <CourseEditor />
                      </ProtectedRoute>
                    } />
                    <Route path="/course-builder" element={
                      <ProtectedRoute requiredRole="organization">
                        <CourseBuilder />
                      </ProtectedRoute>
                    } />
                    <Route path="/course-builder/:courseId" element={
                      <ProtectedRoute requiredRole="organization">
                        <CourseBuilder />
                      </ProtectedRoute>
                    } />
                    <Route path="/course-preview/:courseId" element={
                      <ProtectedRoute requiredRole="organization">
                        <CoursePreview />
                      </ProtectedRoute>
                    } />
                    <Route path="/course/:courseId/learn" element={
                      <ProtectedRoute>
                        <CourseLearning />
                      </ProtectedRoute>
                    } />
                    <Route path="/join/:token" element={<JoinByLink />} />
                    <Route path="/features" element={<Features />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/blog" element={<Blog />} />
                    <Route path="/blog/:slug" element={<BlogPost />} />
                    <Route path="/install" element={<Install />} />
                    <Route path="/feature/frdo" element={<FeatureFRDO />} />
                    <Route path="/feature/documents" element={<FeatureDocuments />} />
                    <Route path="/feature/video-id" element={<FeatureVideoId />} />
                    <Route path="/feature/labor-safety" element={<FeatureLaborSafety />} />
                    <Route path="/feature/course-store" element={<FeatureCourseStore />} />
                    <Route path="/feature/document-checklist" element={<FeatureDocumentChecklist />} />
                    <Route path="/feature/course-settings" element={<FeatureCourseSettings />} />
                    <Route path="/feature/branding" element={<FeatureBranding />} />
                    <Route path="/feature/ai-courses" element={<FeatureAICourses />} />
                    <Route path="/roadmap" element={<RoadmapPage />} />
                    <Route path="/public-offer" element={<PublicOffer />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/personal-data" element={<PersonalDataPolicy />} />
                    <Route path="/course-import" element={
                      <ProtectedRoute requiredRole="organization">
                        <CourseImport />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin" element={
                      <ProtectedRoute requiredRole="admin">
                        <AdminDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/sales" element={
                      <ProtectedRoute requiredRole="sales_manager">
                        <SalesDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/company" element={
                      <ProtectedRoute requiredRole="company">
                        <CompanyDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/learning/:courseId" element={<LearningRedirect />} />
                    <Route path="/proposal/:id" element={<ProposalPublic />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </TooltipProvider>
            </AuthProvider>
          </Router>
        </QueryClientProvider>
      </ThemeProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
