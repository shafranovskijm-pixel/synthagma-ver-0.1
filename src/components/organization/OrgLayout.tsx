import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { OrgDashboardProvider } from "@/contexts/OrgDashboardContext";

function OrgLayoutSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

export default function OrgLayout() {
  return (
    <OrgDashboardProvider>
      <Suspense fallback={<OrgLayoutSpinner />}>
        <Outlet />
      </Suspense>
    </OrgDashboardProvider>
  );
}
