"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setBrandLogo } from "@/app/app/actions";
import { createClient } from "@/lib/supabase/client";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX = 5 * 1024 * 1024;

export function LogoUploader({
  projectId,
  workspaceId,
  logoUrl,
  readOnly,
}: {
  projectId: string;
  workspaceId: string;
  logoUrl: string | null;
  readOnly: boolean;
}) {
  const t = useTranslations("brandKitLogo");
  const te = useTranslations("errors");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    const ext = TYPES[file.type];
    if (!ext) return setError(t("badType"));
    if (file.size > MAX) return setError(t("tooBig"));
    start(async () => {
      const supabase = createClient();
      const path = `${workspaceId}/${projectId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) return setError(te("generic"));
      const res = await setBrandLogo(projectId, path);
      if (res?.error) {
        await supabase.storage.from("brand-assets").remove([path]);
        return setError(te(res.error));
      }
      toast.success(t("upload"));
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await setBrandLogo(projectId, null);
      if (res?.error) return setError(te(res.error));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid size-24 place-items-center overflow-hidden rounded-lg border bg-secondary">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="size-full object-contain p-2" />
        ) : (
          <ImageUp className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        )}
      </div>
      {!readOnly && (
        <div className="space-y-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
            aria-label={t("upload")}
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => input.current?.click()}>
              <ImageUp /> {pending ? t("uploading") : logoUrl ? t("replace") : t("upload")}
            </Button>
            {logoUrl && (
              <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
                <Trash2 /> {t("remove")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
