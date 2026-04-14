import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { protectedRoute } from "./helpers";

const AdminDashboard = lazyWithRetry(() => import("@/pages/AdminDashboard"));
const SalesDashboard = lazyWithRetry(() => import("@/pages/SalesDashboard"));

export const adminRoutes = (
  <>
    <Route path="/admin" element={protectedRoute(<AdminDashboard />, "admin")} />
    <Route path="/sales" element={protectedRoute(<SalesDashboard />, "sales_manager")} />
  </>
);
