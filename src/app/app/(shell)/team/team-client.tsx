"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Copy, Crown, LogOut, MailX, MoreHorizontal, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignableRoles, canRemoveMember, canTransferOwnership, INVITABLE_ROLES, type Role, type TeamError } from "@/lib/team/roles";
import { changeMemberRole, inviteMember, leaveWorkspace, removeMember, revokeInvitation, transferOwnership } from "./actions";

function useTeamError() {
  const t = useTranslations("team.errors");
  return (e?: TeamError) => (e && t.has(e) ? t(e) : t("generic"));
}

// ---------------------------------------------------------------- invitar

export function InviteForm({ disabled }: { disabled: boolean }) {
  const t = useTranslations("team");
  const errorText = useTeamError();
  const [state, action] = useActionState(inviteMember, undefined);
  const [role, setRole] = useState<string>("editor");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && !state.error) {
      toast.success(t("invite.sent", { email: state.email ?? "" }));
      formRef.current?.reset();
    }
  }, [state, t]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="invite-email">{t("invite.email")}</Label>
          <Input id="invite-email" name="email" type="email" required maxLength={254} autoComplete="off" placeholder={t("invite.emailPlaceholder")} disabled={disabled} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">{t("invite.role")}</Label>
          <Select name="role" value={role} onValueChange={setRole} disabled={disabled}>
            <SelectTrigger id="invite-role" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVITABLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`roles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SubmitButton disabled={disabled} pendingLabel={t("invite.sending")}>
          {t("invite.submit")}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{t("invite.hint")}</p>
      {state?.error && state.error !== "email_failed" && (
        <p role="alert" className="text-sm text-destructive">
          {errorText(state.error)}
        </p>
      )}
      {state?.error === "email_failed" && state.link && <CopyLink link={state.link} label={t("invite.emailFailed", { email: state.email ?? "" })} />}
    </form>
  );
}

function CopyLink({ link, label }: { link: string; label: string }) {
  const t = useTranslations("team");
  return (
    <div role="status" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
      <p>{label}</p>
      <div className="flex gap-2">
        <Input readOnly value={link} aria-label={t("invite.link")} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(t("copied")))}
          aria-label={t("copy")}
        >
          <Copy className="size-4" strokeWidth={1.5} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- miembros

export type MemberRow = { userId: string; role: Role; name: string | null; email: string | null; joined: string };

function initials(name: string | null, email: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Confirm = { kind: "remove" | "transfer"; member: MemberRow } | null;

export function MembersList({ members, myRole, myId, ownerCount }: { members: MemberRow[]; myRole: Role; myId: string; ownerCount: number }) {
  const t = useTranslations("team");
  const errorText = useTeamError();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <Users className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-muted-foreground">{t("members.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  const run = (fn: () => Promise<{ ok?: boolean; error?: TeamError } | undefined>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res?.error) toast.error(errorText(res.error));
      else {
        toast.success(success);
        setConfirm(null);
      }
    });

  return (
    <>
      <Card className="py-0">
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const isSelf = m.userId === myId;
            const roles = isSelf && m.role !== "owner" ? [] : assignableRoles(myRole, m.role, ownerCount);
            const canRemove = canRemoveMember(myRole, m.role, isSelf);
            const canTransfer = canTransferOwnership(myRole, m.role, isSelf);
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-muted font-mono text-xs">
                  {initials(m.name, m.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name || m.email || t("members.noName")} {isSelf && <span className="text-muted-foreground">({t("members.you")})</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email ? `${m.email} · ` : ""}
                    {t("members.joined", { date: m.joined })}
                  </p>
                </div>
                {roles.length > 0 ? (
                  <Select value={m.role === "owner" ? undefined : m.role} onValueChange={(v) => run(() => changeMemberRole(m.userId, v), t("members.roleChanged"))} disabled={pending}>
                    <SelectTrigger size="sm" className="w-32" aria-label={t("members.changeRole", { name: m.name || m.email || "" })}>
                      <SelectValue placeholder={t(`roles.${m.role}`)} />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`roles.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={m.role === "owner" ? "default" : "secondary"} className="gap-1">
                    {m.role === "owner" && <Crown className="size-3" aria-hidden />}
                    {t(`roles.${m.role}`)}
                  </Badge>
                )}
                {(canRemove || canTransfer) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t("members.actions", { name: m.name || m.email || "" })}>
                        <MoreHorizontal className="size-4" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canTransfer && (
                        <DropdownMenuItem onSelect={() => setConfirm({ kind: "transfer", member: m })}>
                          <Crown className="size-4" strokeWidth={1.5} aria-hidden /> {t("members.transfer")}
                        </DropdownMenuItem>
                      )}
                      {canRemove && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "remove", member: m })}>
                          <UserMinus className="size-4" strokeWidth={1.5} aria-hidden /> {t("members.remove")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>{confirm.kind === "remove" ? t("members.removeTitle") : t("members.transferTitle")}</DialogTitle>
                <DialogDescription>
                  {t(confirm.kind === "remove" ? "members.removeBody" : "members.transferBody", { name: confirm.member.name || confirm.member.email || "" })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">{t("cancel")}</Button>
                </DialogClose>
                <Button
                  variant={confirm.kind === "remove" ? "destructive" : "default"}
                  disabled={pending}
                  onClick={() =>
                    confirm.kind === "remove"
                      ? run(() => removeMember(confirm.member.userId), t("members.removed"))
                      : run(() => transferOwnership(confirm.member.userId), t("members.transferred"))
                  }
                >
                  {confirm.kind === "remove" ? t("members.remove") : t("members.transfer")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- invitaciones pendientes

export function PendingInvites({ invites }: { invites: { id: string; email: string; role: string; expired: boolean; expires: string }[] }) {
  const t = useTranslations("team");
  const errorText = useTeamError();
  const [pending, startTransition] = useTransition();
  if (invites.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{t("pending.empty")}</p>;
  }
  return (
    <Card className="py-0">
      <ul className="divide-y divide-border">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{i.email}</span>
            <Badge variant="secondary">{t.has(`roles.${i.role}`) ? t(`roles.${i.role}`) : i.role}</Badge>
            <span className={`font-mono text-xs ${i.expired ? "text-destructive" : "text-muted-foreground"}`}>
              {i.expired ? t("pending.expired") : t("pending.expires", { date: i.expires })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await revokeInvitation(i.id);
                  if (res?.error) toast.error(errorText(res.error));
                  else toast.success(t("pending.revoked"));
                })
              }
            >
              <MailX className="size-4" strokeWidth={1.5} aria-hidden /> {t("pending.revoke")}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- salir

export function LeaveWorkspace({ workspaceName, blocker }: { workspaceName: string; blocker: "last_member" | "transfer_ownership_required" | null }) {
  const t = useTranslations("team");
  const errorText = useTeamError();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="leave-heading" className="space-y-2 rounded-md border border-destructive/30 p-4">
      <h2 id="leave-heading" className="font-medium">
        {t("leave.title")}
      </h2>
      <p className="text-sm text-muted-foreground">{blocker ? t(`leave.${blocker}`) : t("leave.body", { workspace: workspaceName })}</p>
      <Button variant="destructive" size="sm" disabled={Boolean(blocker)} onClick={() => setOpen(true)}>
        <LogOut className="size-4" strokeWidth={1.5} aria-hidden /> {t("leave.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("leave.confirmTitle", { workspace: workspaceName })}</DialogTitle>
            <DialogDescription>{t("leave.confirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t("cancel")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await leaveWorkspace();
                  if (res?.error) toast.error(errorText(res.error));
                })
              }
            >
              {t("leave.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
