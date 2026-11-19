"use client";

/** Abre el panel de preferencias de cookies (lo escucha el banner de consentimiento). */
export function CookiePreferencesButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("kreo:open-cookie-preferences"))}
      className="rounded-sm text-left text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}
