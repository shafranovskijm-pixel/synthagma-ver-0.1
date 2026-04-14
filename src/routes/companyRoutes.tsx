import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { protectedRoute } from "./helpers";

const CompanyDashboard = lazyWithRetry(() => import("@/pages/CompanyDashboard"));

export const companyRoutes = (
  <>
    <Route path="/company" element={protectedRoute(<CompanyDashboard />, "company")} />
  </>
);
