import { Navigate, useSearchParams } from "react-router-dom";

export default function StudentProfile() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section");
  const target = section
    ? `/student?tab=profile&section=${encodeURIComponent(section)}`
    : "/student?tab=profile";
  return <Navigate to={target} replace />;
}
