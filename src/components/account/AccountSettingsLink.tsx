import { Link, useLocation } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function AccountSettingsMenuItem() {
  const location = useLocation();
  return (
    <DropdownMenuItem asChild>
      <Link to="/account" state={{ accountReturnTo: location.pathname + location.search }} className="gap-2 py-2.5">
        <Shield className="h-4 w-4 shrink-0" />
        Настройки аккаунта
      </Link>
    </DropdownMenuItem>
  );
}

export function AccountSettingsLink() {
  const location = useLocation();
  return (
    <Button asChild variant="ghost" size="sm" className="gap-2">
      <Link to="/account" state={{ accountReturnTo: location.pathname + location.search }}><Shield className="h-4 w-4 shrink-0" />Настройки аккаунта</Link>
    </Button>
  );
}
