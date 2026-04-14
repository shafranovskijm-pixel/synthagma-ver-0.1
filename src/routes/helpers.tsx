import { Navigate, useParams } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { ReactElement } from "react";

const PaymentResultPage = lazyWithRetry(() => import("@/pages/PaymentResult"));

export const PaymentResult = ({ success }: { success: boolean }) => (
  <PaymentResultPage success={success} />
);

export const LearningRedirect = () => {
  const { courseId } = useParams();
  return <Navigate to={`/course/${courseId}/learn`} replace />;
};

export const protectedRoute = (element: ReactElement, requiredRole?: string) => (
  <ProtectedRoute requiredRole={requiredRole}>{element}</ProtectedRoute>
);
