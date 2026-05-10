import { headers } from "next/headers";

export async function getAppUrl() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const isStripeLive = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live");

  if (host) {
    const isLocal = host.includes("localhost") || host.startsWith("127.0.0.1");
    
    // If it's stripe live mode, we MUST use https (Stripe requirement)
    // Otherwise, use x-forwarded-proto or fallback based on being local/remote
    let protocol = headerStore.get("x-forwarded-proto") || (isLocal ? "http" : "https");
    
    if (isStripeLive && !isLocal) {
        protocol = "https";
    }

    return `${protocol}://${host}`;
  }

  const fallbackUrl = (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );

  // If fallback is http but we are in stripe live mode and not on localhost, upgrade to https
  if (isStripeLive && fallbackUrl.startsWith("http://") && !fallbackUrl.includes("localhost")) {
      return fallbackUrl.replace("http://", "https://");
  }

  return fallbackUrl;
}
