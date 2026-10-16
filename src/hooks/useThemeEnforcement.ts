import { useEffect, useState } from "react";
import { isSharedThemeEnforced, THEME_PREFERENCES_EVENT } from "@/lib/themePreferences";

/** Cosmetic controls only; organization write rights remain server-enforced. */
export function useThemeEnforcement() {
  const [enforced, setEnforced] = useState(isSharedThemeEnforced);
  useEffect(() => {
    const sync = () => setEnforced(isSharedThemeEnforced());
    sync();
    window.addEventListener(THEME_PREFERENCES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_PREFERENCES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return enforced;
}
