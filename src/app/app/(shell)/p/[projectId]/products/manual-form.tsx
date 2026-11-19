"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResearchError } from "../competitors/_components/shared";
import { saveProduct } from "./actions";

/** Alta manual de un producto (sin anuncio): para usar la calculadora y el Cazador con productos propios. */
export function ManualProductForm({ projectId, listId }: { projectId: string; listId: string | null }) {
  const t = useTranslations("products.manual");
  const errorText = useResearchError();
  const [title, setTitle] = useState("");
  const [busy, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        start(async () => {
          const r = await saveProduct({ projectId, listId, title });
          if (r.ok) setTitle("");
          else toast.error(errorText(r.error));
        });
      }}
    >
      <Input aria-label={t("label")} placeholder={t("placeholder")} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <Button type="submit" variant="secondary" disabled={busy || !title.trim()} className="shrink-0">
        <Plus /> {t("add")}
      </Button>
    </form>
  );
}
