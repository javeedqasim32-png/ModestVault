import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRecentlyViewedCookieName } from "@/lib/recently-viewed";

export async function GET(request: Request) {
  const session = await auth();
  const cookieName = getRecentlyViewedCookieName(session?.user?.id);
  const requestUrl = new URL(request.url);
  const redirectToRaw = requestUrl.searchParams.get("redirect") || "/";
  // Force a same-origin relative redirect to avoid localhost host leaks in dev/proxy setups.
  const redirectTo = redirectToRaw.startsWith("/") ? redirectToRaw : "/";
  const response = NextResponse.redirect(redirectTo, 303);

  response.cookies.set(cookieName, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });

  return response;
}
