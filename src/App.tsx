import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import RegisterOrganization from "./pages/RegisterOrganization";
import StudentDashboard from "./pages/StudentDashboard";
import OrganizationDashboard from "./pages/OrganizationDashboard";
import CourseEditor from "./pages/CourseEditor";
import CourseLearning from "./pages/CourseLearning";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
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
            <Route path="/course/:courseId/learn" element={
              <ProtectedRoute>
                <CourseLearning />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
