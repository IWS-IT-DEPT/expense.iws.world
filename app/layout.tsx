import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { PwaRegister } from "./components/install-app";
import { PressFeedback } from "./components/press-feedback";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IWS Expense",
  description: "Expense tracking and reporting for the IWS group of companies",
  applicationName: "IWS Expense",
  // iPhone "Add to Home Screen": own title/icon, full-screen.
  appleWebApp: { capable: true, title: "IWS Expense", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#2f9e5a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
        <PressFeedback />
      </body>
    </html>
  );
}
