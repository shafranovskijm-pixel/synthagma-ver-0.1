import { Navigate } from "react-router-dom";

export default function OrganizationSettings() {
  return <Navigate to="/organization?tab=settings" replace />;
}
