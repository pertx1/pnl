"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { OPEN_PREFERENCES_EVENT, readConsent, writeConsent } from "@/lib/consent";

/** Banner de consentimiento. "Aceptar" y "Rechazar" con el mismo peso visual (criterio AEPD). */
export function CookieBanner() {
  const t = useTranslations("cookieBanner");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      const current = readConsent();
      if (!current) setOpen(true);
    }, 0);
    const onOpen = () => {
      const c = readConsent();
      setAnalytics(c?.analytics ?? false);
      setMarketing(c?.marketing ?? false);
      setCustom(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, onOpen);
    return () => {
      clearTimeout(id);
      window.removeEventListener(OPEN_PREFERENCES_EVENT, onOpen);
    };
  }, []);

  // Mientras el aviso está abierto, reserva su altura al final de la página para que nunca tape
  // contenido ni botones (en móvil tapaba "Entrar").
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const apply = () => {
      document.body.style.paddingBottom = `${el.offsetHeight + 24}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [open, custom]);

  if (!open) return null;

  const save = (a: boolean, m: boolean) => {
    writeConsent({ analytics: a, marketing: m });
    setOpen(false);
    setCustom(false);
  };

  return (
    <div ref={ref} role="dialog" aria-modal="false" aria-labelledby="cookie-title" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-lg border bg-card p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4">
      <h2 id="cookie-title" className="label-mono">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("body")}{" "}
        <Link href="/legal/cookies" className="link">
          {t("policy")}
        </Link>
      </p>

      {custom && (
        <div className="mt-4 space-y-3">
          {[
            { id: "necessary", label: t("necessary"), body: t("necessaryBody"), checked: true, disabled: true, on: () => {} },
            { id: "analytics", label: t("analytics"), body: t("analyticsBody"), checked: analytics, disabled: false, on: setAnalytics },
            { id: "marketing", label: t("marketing"), body: t("marketingBody"), checked: marketing, disabled: false, on: setMarketing },
          ].map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-4">
              <label htmlFor={`cookie-${c.id}`} className="text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.body}</span>
              </label>
              <Switch id={`cookie-${c.id}`} checked={c.checked} disabled={c.disabled} onCheckedChange={(v) => c.on(Boolean(v))} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => save(false, false)}>
          {t("rejectAll")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => save(true, true)}>
          {t("acceptAll")}
        </Button>
        {custom ? (
          <Button size="sm" onClick={() => save(analytics, marketing)}>
            {t("save")}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setCustom(true)}>
            {t("customize")}
          </Button>
        )}
      </div>
    </div>
  );
}
