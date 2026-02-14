import React, { createContext, useContext } from "react";
import { useOrganizationDashboard } from "@/hooks/useOrganizationDashboard";

type OrgDashboardContextType = ReturnType<typeof useOrganizationDashboard>;

const OrgDashboardContext = createContext<OrgDashboardContextType | null>(null);

export function OrgDashboardProvider({ children }: { children: React.ReactNode }) {
  const dashboard = useOrganizationDashboard();
  return (
    <OrgDashboardContext.Provider value={dashboard}>
      {children}
    </OrgDashboardContext.Provider>
  );
}

export function useOrgDashboard(): OrgDashboardContextType {
  const ctx = useContext(OrgDashboardContext);
  if (!ctx) throw new Error("useOrgDashboard must be used within OrgDashboardProvider");
  return ctx;
}
