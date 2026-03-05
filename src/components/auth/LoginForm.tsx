import * as React from "react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthLoginCommand, AuthLoginResponseDto, AuthUserDto } from "@/types";

const API_BASE =
  typeof import.meta.env !== "undefined" && import.meta.env.PUBLIC_API_URL
    ? String(import.meta.env.PUBLIC_API_URL).replace(/\/$/, "")
    : "http://localhost:8000";

const MESSAGE_LABELS: Record<string, string> = {
  session_expired: "Session expired. Please log in again.",
};

export interface LoginFormProps {
  redirectUrl?: string;
  message?: string | null;
  onSuccess?: (user: AuthUserDto) => void;
}

function parseErrorDetail(response: Response, body: unknown): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null && "msg" in d[0]) {
      return String((d[0] as { msg: string }).msg);
    }
  }
  if (response.status === 401) return "Invalid login or password.";
  if (response.status === 422) return "Please fill in login and password.";
  if (response.status >= 500) return "Server error. Please try again later.";
  return "Connection error. Check your network and try again.";
}

function LoginForm({ redirectUrl = "/images", message: messageParam = null, onSuccess }: LoginFormProps) {
  const displayMessage = messageParam ? (MESSAGE_LABELS[messageParam] ?? messageParam) : null;
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const loginId = useId();
  const passwordId = useId();
  const errorId = useId();

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setErrorMessage(null);

      const trimmedLogin = login.trim();
      if (!trimmedLogin || !password) {
        setErrorMessage("Please fill in login and password.");
        return;
      }

      setIsSubmitting(true);
      const body: AuthLoginCommand = { login: trimmedLogin, password };

      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setErrorMessage(parseErrorDetail(res, data));
          return;
        }

        const response = data as AuthLoginResponseDto;
        const user = response.user;
        if (user) onSuccess?.(user);
        window.location.href = redirectUrl;
      } catch {
        setErrorMessage("Connection error. Check your network and try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [login, password, redirectUrl, onSuccess]
  );

  const handleDemoClick = React.useCallback(() => {
    window.location.href = `${redirectUrl}?demo=1`;
  }, [redirectUrl]);

  const submitDisabled = isSubmitting || !login.trim() || !password;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
      aria-describedby={errorMessage ? errorId : undefined}
    >
      {displayMessage && (
        <div
          role="alert"
          className="rounded-xl border-2 border-primary/50 bg-primary/10 px-3 py-2 text-sm text-foreground"
        >
          {displayMessage}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={loginId}>
          <span data-lang="pl">Login</span>
          <span data-lang="en">Login</span>
        </Label>
        <Input
          id={loginId}
          type="text"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          disabled={isSubmitting}
          aria-invalid={!!errorMessage}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={passwordId}>
          <span data-lang="pl">Hasło</span>
          <span data-lang="en">Password</span>
        </Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
          aria-invalid={!!errorMessage}
        />
      </div>

      {errorMessage && (
        <div
          id={errorId}
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={submitDisabled} aria-busy={isSubmitting}>
          {isSubmitting ? (
            <>
              <span data-lang="pl">Logowanie…</span>
              <span data-lang="en">Signing in…</span>
            </>
          ) : (
            <>
              <span data-lang="pl">Zaloguj</span>
              <span data-lang="en">Log in</span>
            </>
          )}
        </Button>
        <Button type="button" variant="secondary" onClick={handleDemoClick} disabled={isSubmitting}>
          <span data-lang="pl">Tryb demo</span>
          <span data-lang="en">Demo mode</span>
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <span data-lang="pl">Dane demo: user / 123</span>
        <span data-lang="en">Demo credentials: user / 123</span>
      </p>
    </form>
  );
}

export default LoginForm;
