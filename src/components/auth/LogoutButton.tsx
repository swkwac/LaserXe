import * as React from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export interface LogoutButtonProps {
  redirectPath?: string;
  className?: string;
  children?: React.ReactNode;
}

function LogoutButton({ redirectPath = "/login", className, children }: LogoutButtonProps) {
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
      {isLoading ? (
        <>
          <span data-lang="pl">Wylogowanie…</span>
          <span data-lang="en">Logging out…</span>
        </>
      ) : (
        <>
          {children ?? (
            <>
              <span data-lang="pl">Wyloguj</span>
              <span data-lang="en">Log out</span>
            </>
          )}
        </>
      )}
    </Button>
  );
}

export default LogoutButton;
