import { Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import { StaffPermissionsProvider } from "@/hooks/useStaffPermissions";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LazyLoadFallback } from "@/components/LazyLoadFallback";
import { TwoFactorChallenge } from "@/components/auth/TwoFactorChallenge";
import { ScrollToTop } from "./components/ScrollToTop";
import { SpecialOfferPopup } from "./components/landing/SpecialOfferPopup";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { NetworkBlockBanner } from "./components/NetworkBlockBanner";
import { ProxyChannelIndicator } from "./components/ProxyChannelIndicator";
import { installTestQueueListeners } from "./utils/testAnswerQueue";
import { useThemePersonalization } from "@/components/ui/ThemePersonalization";
import { captureRefFromUrl } from "@/utils/referralCookie";
import { BackgroundUploadsProvider } from "@/contexts/BackgroundUploadsContext";
import { BackgroundUploadsTray } from "@/components/uploads/BackgroundUploadsTray";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";

import {
  publicRoutes,
  studentRoutes,
  organizationRoutes,
  adminRoutes,
  partnerRoutes,
  companyRoutes,
} from "@/routes";

captureRefFromUrl();
installTestQueueListeners();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Global default: считаем данные свежими 30 сек.
      // Снижает нагрузку на БД и устраняет дубликаты запросов между вкладками.
      // Для редко меняющихся справочников используйте локально staleTime: 5 * 60 * 1000.
      staleTime: 30 * 1000,
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
              <StaffPermissionsProvider>
              <BackgroundUploadsProvider>
                <ThemeInit />
                <ScrollToTop />
                <NetworkBlockBanner />
                <OfflineIndicator />
                <ProxyChannelIndicator />
                <TooltipProvider>
                  <Sonner />
                  <SpecialOfferPopup />
                  <BackgroundUploadsTray />
                  <SupportChatWidget />
                  <TwoFactorChallenge />
                  
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
              </BackgroundUploadsProvider>
              </StaffPermissionsProvider>
            </AuthProvider>
          </Router>
        </QueryClientProvider>
      </ThemeProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
