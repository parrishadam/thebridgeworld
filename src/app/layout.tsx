import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import LoginLogger from "@/components/auth/LoginLogger";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The Bridge World",
    template: "%s | The Bridge World",
  },
  description: "The definitive digital magazine for bridge players worldwide.",
  openGraph: {
    siteName: "The Bridge World",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
        <body className="antialiased bg-stone-50 text-stone-900">
          <LoginLogger />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
