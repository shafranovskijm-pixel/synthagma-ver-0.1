import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
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
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
