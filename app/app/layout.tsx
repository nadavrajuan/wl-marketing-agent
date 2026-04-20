import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WL Marketing Agent",
  description: "PPC Marketing Analytics & Optimization — Weight Loss Campaigns",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen flex`}>
        <Sidebar />
        <main className="flex-1 min-h-screen overflow-auto p-6">{children}</main>
      </body>
    </html>
  );
}
