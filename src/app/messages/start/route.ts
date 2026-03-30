import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { startConversationWithSeller } from "@/app/actions/messages";

function getRequestBaseUrl(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "") || "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const baseUrl = getRequestBaseUrl(request);
  const sellerId = url.searchParams.get("sellerId") || "";
  const listingId = url.searchParams.get("listingId");

  if (!sellerId) {
    return NextResponse.redirect(new URL("/messages", baseUrl));
  }

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(`${url.pathname}${url.search}`);
    return NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, baseUrl));
  }

  const result = await startConversationWithSeller({ sellerId, listingId });
  if ("error" in result) {
    return NextResponse.redirect(new URL(`/sellers/${sellerId}`, baseUrl));
  }

  return NextResponse.redirect(new URL(`/messages/${result.conversationId}`, baseUrl));
}
