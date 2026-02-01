import * as React from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export interface LogoutButtonProps {
  redirectPath?: string;
  className?: string;
  children?: React.ReactNode;
}

function LogoutButton({ redirectPath = "/login", className, children = "Wyloguj" }: LogoutButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleClick = React.useCallback(async () => {
    setIsLoading(true);
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        handle401: false,
      });
    } finally {
      window.location.href = redirectPath;
    }
  }, [redirectPath]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={handleClick}
      disabled={isLoading}
      aria-busy={isLoading}
    >
      {isLoading ? "Wylogowanie…" : children}
    </Button>
  );
}

export default LogoutButton;
