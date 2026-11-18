"use client";

import { useTranslations } from "next-intl";
import type { ErrorKey } from "@/lib/server/errors";

export function FormError({ error }: { error?: ErrorKey }) {
  const t = useTranslations("errors");
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {t(error)}
    </p>
  );
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}
