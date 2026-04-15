import { Navigate } from "react-router-dom";

export default function StudentProfile() {
  return <Navigate to="/student?tab=profile" replace />;
}
