import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export default function ContractEditor() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/organization?tab=contract-editor", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <SigmaSpinner size="lg" />
    </div>
  );
}
