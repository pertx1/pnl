"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/app/app/(shell)/notifications/actions";

/** Marca un aviso como leído al abrirlo (efecto en el cliente: nada de mutaciones durante el render del servidor). */
export function MarkReadOnView({ id, unread }: { id: string; unread: boolean }) {
  useEffect(() => {
    if (unread) void markNotificationsRead([id]);
  }, [id, unread]);
  return null;
}
