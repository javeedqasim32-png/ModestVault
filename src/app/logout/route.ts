import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login?loggedOut=1", request.url));

  // Clear common Auth.js / NextAuth session cookies for both secure and non-secure setups.
  const cookieNames = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "authjs.callback-url",
    "__Secure-authjs.callback-url",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
    "authjs.csrf-token",
    "__Host-authjs.csrf-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
  ];

  for (const name of cookieNames) {
    response.cookies.set(name, "", {
      expires: new Date(0),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  }

  response.headers.set("Cache-Control", "no-store");
  return response;
}
