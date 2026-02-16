import {
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/setup", { credentials: "include" })
      .then((res) => res.json())
      .then((data: { setupRequired?: boolean }) => {
        if (cancelled) return;
        if (data.setupRequired === false) {
          navigate({ to: "/" });
          return;
        }
        setSetupRequired(true);
      })
      .catch(() => {
        if (!cancelled) setSetupRequired(true);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = (formData.get("email") as string)?.trim();
    const password = formData.get("password") as string;
    const firstName = (formData.get("firstName") as string)?.trim() || undefined;
    const lastName = (formData.get("lastName") as string)?.trim() || undefined;

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Setup failed");
        return;
      }

      if (data.success) {
        window.location.href = "/";
        return;
      }
      navigate({ to: "/" });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (setupRequired === null) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Checking setup status…</p>
      </div>
    );
  }

  if (!setupRequired) {
    return null;
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center justify-center py-12">
      <div className="w-full rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-foreground">
          Create admin account
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}
          <div>
            <label
              htmlFor="setup-email"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="setup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="setup-password"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="setup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label
              htmlFor="setup-firstName"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              First name
            </label>
            <input
              id="setup-firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label
              htmlFor="setup-lastName"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Last name
            </label>
            <input
              id="setup-lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? "Creating account…" : "Create admin account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a
            href="/login"
            className="font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
