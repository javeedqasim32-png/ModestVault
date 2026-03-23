"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      Log out
    </button>
  );
}
