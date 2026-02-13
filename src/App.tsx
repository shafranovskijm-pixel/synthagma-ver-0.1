import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import BrandedLogin from "./pages/BrandedLogin";
import ResetPassword from "./pages/ResetPassword";
import Register from "./pages/Register";
import RegisterOrganization from "./pages/RegisterOrganization";
import StudentDashboard from "./pages/StudentDashboard";
import OrganizationDashboard from "./pages/OrganizationDashboard";
import CourseEditor from "./pages/CourseEditor";
import CourseBuilder from "./pages/CourseBuilder";
import CourseLearning from "./pages/CourseLearning";
import CoursePreview from "./pages/CoursePreview";
import JoinByLink from "./pages/JoinByLink";
import AdminDashboard from "./pages/AdminDashboard";
import Features from "./pages/Features";
import CourseImport from "./pages/CourseImport";
import About from "./pages/About";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Install from "./pages/Install";
import FeatureFRDO from "./pages/FeatureFRDO";
import FeatureDocuments from "./pages/FeatureDocuments";
import FeatureVideoId from "./pages/FeatureVideoId";
import RoadmapPage from "./pages/RoadmapPage";
import NotFound from "./pages/NotFound";
import { ScrollToTop } from "./components/ScrollToTop";

const queryClient = new QueryClient();

const isNative = typeof (window as any).Capacitor !== 'undefined';
const Router = isNative ? HashRouter : BrowserRouter;

const App = () => (
  <HelmetProvider>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryClientProvider client={queryClient}>
        <Router>
          <AuthProvider>
            <ScrollToTop />
            <TooltipProvider>
              <Toaster />
              <Sonner />
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
                <Route path="/roadmap" element={<RoadmapPage />} />
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
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TooltipProvider>
          </AuthProvider>
        </Router>
      </QueryClientProvider>
    </ThemeProvider>
  </HelmetProvider>
);

export default App;
