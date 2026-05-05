import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { OrgDashboardProvider } from "@/contexts/OrgDashboardContext";
import { SmartLoadingFallback } from "@/components/SmartLoadingFallback";

export default function OrgLayout() {
  return (
    <OrgDashboardProvider>
      <Suspense fallback={<SmartLoadingFallback timeoutSec={10} />}>
        <Outlet />
      </Suspense>
    </OrgDashboardProvider>
  );
}
