import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { protectedRoute } from "./helpers";

const AdminDashboard = lazyWithRetry(() => import("@/pages/AdminDashboard"));
const SalesDashboard = lazyWithRetry(() => import("@/pages/SalesDashboard"));
const AdminUserDetails = lazyWithRetry(() => import("@/pages/AdminUserDetails"));
const ProxySetup = lazyWithRetry(() => import("@/pages/admin/ProxySetup"));
const RegistrationLeads = lazyWithRetry(() => import("@/pages/admin/RegistrationLeads"));

export const adminRoutes = (
  <>
    <Route path="/admin" element={protectedRoute(<AdminDashboard />, "admin")} />
    <Route path="/admin/user/:userId" element={protectedRoute(<AdminUserDetails />, "admin")} />
    <Route path="/admin/proxy-setup" element={protectedRoute(<ProxySetup />, "admin")} />
    <Route path="/admin/registration-leads" element={protectedRoute(<RegistrationLeads />, "admin")} />
    <Route path="/sales" element={protectedRoute(<SalesDashboard />, "sales_manager")} />
  </>
);
