import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "Modaire | Modest Fashion Marketplace",
  description: "Shop the latest modest fashion — curated collections, premium quality, and global community.",
  openGraph: {
    title: "Modaire | Modest Fashion Marketplace",
    description: "Shop the latest modest fashion — curated collections, premium quality, and global community.",
    url: "https://shopmodaire.com",
    siteName: "Modaire",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Modaire | Modest Fashion Marketplace",
    description: "Shop the latest modest fashion — curated collections, premium quality, and global community.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased bg-background text-foreground min-h-screen flex flex-col`}>
        <Navbar />
        <main className="flex-1 flex flex-col w-full pb-24 lg:pb-0">
          {children}
        </main>
        <MobileBottomNav />
      </body>
    </html>
  );
}
