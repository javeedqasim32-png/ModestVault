import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listMyNotifications } from "@/app/actions/notifications";
import NotificationsClient from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login?callbackUrl=/notifications");
    }
    const notifications = await listMyNotifications({ limit: 100 });
    return <NotificationsClient initialNotifications={notifications} />;
}
