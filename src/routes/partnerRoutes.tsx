import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/utils/lazyWithRetry";

const PartnerLanding = lazyWithRetry(() => import("@/pages/PartnerLanding"));
const PartnerDashboard = lazyWithRetry(() => import("@/pages/PartnerDashboard"));
const PartnerOffer = lazyWithRetry(() => import("@/pages/PartnerOffer"));

export const partnerRoutes = (
  <>
    <Route path="/partner" element={<PartnerLanding />} />
    <Route path="/partner/dashboard" element={<PartnerDashboard />} />
    <Route path="/partner/offer" element={<PartnerOffer />} />
  </>
);
