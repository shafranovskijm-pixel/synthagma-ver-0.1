import { Suspense } from "react";
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
import { SpecialOfferPopup } from "./components/landing/SpecialOfferPopup";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { useThemePersonalization } from "@/components/ui/ThemePersonalization";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { captureRefFromUrl } from "@/utils/referralCookie";

// Capture referral code from URL on any page load
captureRefFromUrl();

// Lazy-loaded pages with automatic retry + reload on chunk failures
const Index = lazyWithRetry(() => import("./pages/Index"));
const Login = lazyWithRetry(() => import("./pages/Login"));
const BrandedLogin = lazyWithRetry(() => import("./pages/BrandedLogin"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const RegisterOrganization = lazyWithRetry(() => import("./pages/RegisterOrganization"));
const StudentDashboard = lazyWithRetry(() => import("./pages/StudentDashboard"));
const StudentProfile = lazyWithRetry(() => import("./pages/StudentProfile"));
const OrganizationDashboard = lazyWithRetry(() => import("./pages/OrganizationDashboard"));
const OrganizationProfile = lazyWithRetry(() => import("./pages/OrganizationProfile"));
const CourseEditor = lazyWithRetry(() => import("./pages/CourseEditor"));
const CourseBuilder = lazyWithRetry(() => import("./pages/CourseBuilder"));
const CourseLearning = lazyWithRetry(() => import("./pages/CourseLearning"));
const CourseLanding = lazyWithRetry(() => import("./pages/CourseLanding"));
const CoursePreview = lazyWithRetry(() => import("./pages/CoursePreview"));
const JoinByLink = lazyWithRetry(() => import("./pages/JoinByLink"));
const AdminDashboard = lazyWithRetry(() => import("./pages/AdminDashboard"));
const SalesDashboard = lazyWithRetry(() => import("./pages/SalesDashboard"));
const Features = lazyWithRetry(() => import("./pages/Features"));
const CourseImport = lazyWithRetry(() => import("./pages/CourseImport"));
const About = lazyWithRetry(() => import("./pages/About"));
const Blog = lazyWithRetry(() => import("./pages/Blog"));
const BlogPost = lazyWithRetry(() => import("./pages/BlogPost"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const FeatureFRDO = lazyWithRetry(() => import("./pages/FeatureFRDO"));
const FeatureDocuments = lazyWithRetry(() => import("./pages/FeatureDocuments"));
const FeatureVideoId = lazyWithRetry(() => import("./pages/FeatureVideoId"));
const FeatureLaborSafety = lazyWithRetry(() => import("./pages/FeatureLaborSafety"));
const FeatureCourseStore = lazyWithRetry(() => import("./pages/FeatureCourseStore"));
const FeatureDocumentChecklist = lazyWithRetry(() => import("./pages/FeatureDocumentChecklist"));
const FeatureCourseSettings = lazyWithRetry(() => import("./pages/FeatureCourseSettings"));
const FeatureBranding = lazyWithRetry(() => import("./pages/FeatureBranding"));
const FeatureAICourses = lazyWithRetry(() => import("./pages/FeatureAICourses"));
const RoadmapPage = lazyWithRetry(() => import("./pages/RoadmapPage"));
const RostechnadzorCoursesPage = lazyWithRetry(() => import("./pages/RostechnadzorCoursesPage"));
const CompanyDashboard = lazyWithRetry(() => import("./pages/CompanyDashboard"));
const PublicOffer = lazyWithRetry(() => import("./pages/PublicOffer"));
const StudentAgreement = lazyWithRetry(() => import("./pages/StudentAgreement"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const PersonalDataPolicy = lazyWithRetry(() => import("./pages/PersonalDataPolicy"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const PartnerLanding = lazyWithRetry(() => import("./pages/PartnerLanding"));
const PartnerDashboard = lazyWithRetry(() => import("./pages/PartnerDashboard"));
const PartnerOffer = lazyWithRetry(() => import("./pages/PartnerOffer"));
const ProposalPublic = lazyWithRetry(() => import("./pages/ProposalPublic"));
const ContractEditor = lazyWithRetry(() => import("./pages/ContractEditor"));
const PlatformPresentation = lazyWithRetry(() => import("./pages/PlatformPresentation"));
const EmailResponse = lazyWithRetry(() => import("./pages/EmailResponse"));
const PaymentResult = lazyWithRetry(() => import("./pages/PaymentResult"));
const WhatsNew = lazyWithRetry(() => import("./pages/WhatsNew"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      refetchOnWindowFocus: false,
    },
  },
});

const LearningRedirect = () => { const { courseId } = useParams(); return <Navigate to={`/course/${courseId}/learn`} replace />; };

const isNative = typeof (window as any).Capacitor !== 'undefined';
const Router = isNative ? HashRouter : BrowserRouter;

function ThemeInit() { useThemePersonalization(); return null; }

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <QueryClientProvider client={queryClient}>
          <Router>
            <AuthProvider>
              <ThemeInit />
              <ScrollToTop />
                <OfflineIndicator />
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <SpecialOfferPopup />
                <Suspense fallback={<LazyLoadFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/login/:slug" element={<BrandedLogin />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/register" element={<RegisterOrganization />} />
                    <Route path="/register-organization" element={<RegisterOrganization />} />
                    <Route path="/payment-success" element={<PaymentResult success={true} />} />
                    <Route path="/payment-fail" element={<PaymentResult success={false} />} />
                    <Route path="/student" element={
                      <ProtectedRoute>
                        <StudentDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/student/profile" element={
                      <ProtectedRoute>
                        <StudentProfile />
                      </ProtectedRoute>
                    } />
                    <Route path="/organization" element={
                      <ProtectedRoute requiredRole="organization">
                        <OrganizationDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/organization/profile" element={
                      <ProtectedRoute requiredRole="organization">
                        <OrganizationProfile />
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
                    <Route path="/course/:courseId/landing" element={<CourseLanding />} />
                    <Route path="/c/:slug" element={<CourseLanding />} />
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
                    <Route path="/rostechnadzor-courses" element={<RostechnadzorCoursesPage />} />
                    <Route path="/public-offer" element={<PublicOffer />} />
                    <Route path="/student-agreement" element={<StudentAgreement />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/personal-data" element={<PersonalDataPolicy />} />
                    <Route path="/email-response" element={<EmailResponse />} />
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
                    <Route path="/contract-editor" element={
                      <ProtectedRoute requiredRole="organization">
                        <ContractEditor />
                      </ProtectedRoute>
                    } />
                    <Route path="/presentation" element={<PlatformPresentation />} />
                    <Route path="/partner" element={<PartnerLanding />} />
                    <Route path="/partner/dashboard" element={<PartnerDashboard />} />
                    <Route path="/partner/offer" element={<PartnerOffer />} />
                    <Route path="/whats-new" element={<WhatsNew />} />
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
