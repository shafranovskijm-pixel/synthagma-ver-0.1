import { Navigate, useSearchParams } from "react-router-dom";

export default function OrganizationProfile() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const targetUrl = tab 
    ? `/organization?tab=profile` 
    : `/organization?tab=profile`;
  
  return <Navigate to={targetUrl} replace />;
}
