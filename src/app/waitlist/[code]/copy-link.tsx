"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CopyLink({ link, copyLabel, copiedLabel }: { link: string; copyLabel: string; copiedLabel: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={link} aria-label={copyLabel} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          toast.success(copiedLabel);
        }}
      >
        <Copy /> <span className="sr-only sm:not-sr-only">{copyLabel}</span>
      </Button>
    </div>
  );
}
