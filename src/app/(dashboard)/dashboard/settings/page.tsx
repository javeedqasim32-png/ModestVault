export default function SettingsPage() {
    return (
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mb-6">Settings</h1>
            <div className="flex flex-col items-center justify-center py-20 bg-neutral-50 border border-dashed rounded-xl">
                <h2 className="text-xl font-bold text-neutral-900 mb-2">Account Settings</h2>
                <p className="text-neutral-500 max-w-sm text-center">
                    Update your profile, password, and notification preferences here in the future.
                </p>
            </div>
        </div>
    );
}
