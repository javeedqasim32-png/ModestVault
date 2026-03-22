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

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Settings</h1>
            <AddressSettingsForm userId={session.user.id} initialData={res.user} />
        </div>
    );
}
