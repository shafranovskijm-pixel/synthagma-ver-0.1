import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

const PRIMARY_DOMAIN = "synthagma-bloom.lovable.app";

const NotFound = () => {
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    const isCustomDomain = !hostname.includes("lovable.app");

    if (isCustomDomain) {
      setRedirecting(true);
      const target = `https://${PRIMARY_DOMAIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
      console.log("Redirecting from custom domain to:", target);
      window.location.replace(target);
      return;
    }

    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  if (redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Перенаправление...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
