import { getUserProfile } from "@/app/actions/auth";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AddressSettingsForm } from "@/components/dashboard/AddressSettingsForm";

export default async function SettingsPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }

    const res = await getUserProfile(session.user.id);
    if (res.error || !res.user) {
        return <div className="p-8 text-destructive">Failed to load profile.</div>;
    }

    const initials = `${res.user.first_name?.[0] ?? ""}${res.user.last_name?.[0] ?? ""}`.toUpperCase() || "M";

    return (
        <div className="profile-scroll">
            <div className="profile-inner py-6 sm:py-8">
                <div className="profile-avatar">{initials}</div>
                <h1 className="profile-section-title mt-4 text-center !px-0">Profile Settings</h1>
                <AddressSettingsForm userId={session.user.id} initialData={res.user} />
            </div>
        </div>
    );
}
