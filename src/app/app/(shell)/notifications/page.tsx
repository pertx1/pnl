import { getTranslations } from "next-intl/server";
import { NotificationList } from "@/components/notifications/notification-list";
import { listMyNotifications } from "@/lib/notifications/queries";
import { requireUser } from "@/lib/server/dal";

export async function generateMetadata() {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

export default async function NotificationsPage() {
  await requireUser();
  const t = await getTranslations("notifications");
  const items = await listMyNotifications(100);

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6 [&>*]:max-w-3xl">
      <div>
        <h1 className="page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <NotificationList initial={items} />
      <p className="text-xs text-muted-foreground">{t("retention")}</p>
    </div>
  );
}
