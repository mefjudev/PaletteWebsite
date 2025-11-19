import type { Metadata } from "next";
import { Ibarra_Real_Nova, Inter } from "next/font/google";
import "./globals.css";

const ibarraRealNova = Ibarra_Real_Nova({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibarra",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Palette",
  description: "Palette Login",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibarraRealNova.variable} ${inter.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}


