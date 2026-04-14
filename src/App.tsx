import { Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LazyLoadFallback } from "@/components/LazyLoadFallback";
import { ScrollToTop } from "./components/ScrollToTop";
import { SpecialOfferPopup } from "./components/landing/SpecialOfferPopup";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { useThemePersonalization } from "@/components/ui/ThemePersonalization";
import { captureRefFromUrl } from "@/utils/referralCookie";
import {
  publicRoutes,
  studentRoutes,
  organizationRoutes,
  adminRoutes,
  partnerRoutes,
  companyRoutes,
} from "@/routes";

captureRefFromUrl();

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

const isNative = typeof (window as unknown as Record<string, unknown>).Capacitor !== 'undefined';
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
                <Sonner />
                <SpecialOfferPopup />
                <Suspense fallback={<LazyLoadFallback />}>
                  <Routes>
                    {publicRoutes}
                    {studentRoutes}
                    {organizationRoutes}
                    {adminRoutes}
                    {partnerRoutes}
                    {companyRoutes}
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
