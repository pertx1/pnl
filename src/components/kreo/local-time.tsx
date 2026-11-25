"use client";

import { useSyncExternalStore } from "react";
import { useFormatter } from "next-intl";
import { DEFAULT_TZ } from "@/lib/dashboard/stats";

const noop = () => () => {};

/** Zona horaria del navegador; en el servidor (y al hidratar) la de Kreo, para que no haya desajustes. */
export function useBrowserTimeZone() {
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ,
    () => DEFAULT_TZ,
  );
}

/** Fecha y hora corta («jue 26, 19:00») en la zona horaria del navegador, como el resto de listas del panel. */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const format = useFormatter();
  const timeZone = useBrowserTimeZone();
  return (
    <time dateTime={iso} className={className}>
      {format.dateTime(new Date(iso), { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone })}
    </time>
  );
}
