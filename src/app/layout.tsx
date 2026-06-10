import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import ScrollToTopOnPathChange from "@/components/layout/ScrollToTopOnPathChange";
import UnpaidEarningsBanner from "@/components/sell/UnpaidEarningsBanner";
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

  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} ${jostLocal.variable} ${cormorantLocal.variable} font-sans antialiased bg-background text-foreground min-h-screen flex flex-col`}>
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
