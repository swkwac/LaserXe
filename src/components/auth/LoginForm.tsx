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
  session_expired: "Sesja wygasła. Zaloguj się ponownie.",
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
  if (response.status === 401) return "Nieprawidłowy login lub hasło.";
  if (response.status === 422) return "Wypełnij login i hasło.";
  if (response.status >= 500) return "Błąd serwera. Spróbuj później.";
  return "Błąd połączenia. Sprawdź sieć i spróbuj ponownie.";
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
        setErrorMessage("Wypełnij login i hasło.");
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
        setErrorMessage("Błąd połączenia. Sprawdź sieć i spróbuj ponownie.");
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
        <Label htmlFor={loginId}>Login</Label>
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
        <Label htmlFor={passwordId}>Hasło</Label>
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
          {isSubmitting ? "Logowanie…" : "Zaloguj"}
        </Button>
        <Button type="button" variant="secondary" onClick={handleDemoClick} disabled={isSubmitting}>
          Tryb demo
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">Dane demo: user / 123</p>
    </form>
  );
}

export default LoginForm;
