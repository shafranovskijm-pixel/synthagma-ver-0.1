import { Navigate, useParams } from "react-router-dom";

export default function OrganizationCourseDetails() {
  const { courseId } = useParams();
  return <Navigate to={`/organization?tab=course-details&courseId=${courseId}`} replace />;
}
