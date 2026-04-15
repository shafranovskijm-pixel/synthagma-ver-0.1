import { Navigate } from "react-router-dom";

export default function OrganizationDocuments() {
  return <Navigate to="/organization?tab=org-documents" replace />;
}
