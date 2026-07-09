import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import ScrollToTopOnPathChange from "@/components/layout/ScrollToTopOnPathChange";
import UnpaidEarningsBanner from "@/components/sell/UnpaidEarningsBanner";
import { MetaPixelRouteTracker } from "@/components/analytics/MetaPixelRouteTracker";
import { getCachedSession } from "@/lib/session";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const jostLocal = localFont({
  src: [
    { path: "../fonts/Jost-Light.ttf", weight: "300", style: "normal" },
    { path: "../fonts/Jost-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/Jost-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-jost-local",
  display: "swap",
});
const cormorantLocal = localFont({
  src: [
    { path: "../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-cormorant-local",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Modaire Modest Fashion Marketplace",
  description: "Shop the latest modest fashion — curated collections, premium quality, and global community.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Modaire",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Modaire Modest Fashion Marketplace",
    description: "Shop the latest modest fashion — curated collections, premium quality, and global community.",
    url: "https://shopmodaire.com",
    siteName: "Modaire",
    images: [
      {
        url: "https://shopmodaire.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Modaire",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Modaire Modest Fashion marketplace",
    description: "Shop the latest modest fashion — curated collections, premium quality, and global community.",
    images: ["https://shopmodaire.com/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Resize the layout viewport when the virtual keyboard opens so fixed/dvh
  // elements (e.g. the messages thread composer) snap to just above the keyboard
  // instead of leaving a gap.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Cached per request — already called inside Navbar too, so no extra DB hit.
  const session = await getCachedSession();
  const isAuthed = !!session?.user?.id;
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} ${jostLocal.variable} ${cormorantLocal.variable} font-sans antialiased bg-background text-foreground min-h-screen flex flex-col`}>
        {metaPixelId && (
          <>
            <Script id="meta-pixel-base" strategy="afterInteractive">
              {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');`}
            </Script>
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
            <MetaPixelRouteTracker />
          </>
        )}
        <ScrollToTopOnPathChange />
        <Navbar />
        <main className="flex-1 flex flex-col w-full pb-24 lg:pb-0">
          <UnpaidEarningsBanner />
          {children}
        </main>
        <MobileBottomNav isAuthed={isAuthed} />
      </body>
    </html>
  );
}
