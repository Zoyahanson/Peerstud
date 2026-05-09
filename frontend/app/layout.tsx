import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "../components/navbar";
import ReminderPulse from "../components/reminder-pulse";
import AppConnectionGate from "../components/app-connection-gate";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PeerStud",
  description: "Adaptive study scheduling, tutoring, and collaboration for college students.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AppConnectionGate>
          <a href="#main-content" className="skip-link">Skip to content</a>
          <Navbar />
          <ReminderPulse />
          <div id="main-content">{children}</div>
        </AppConnectionGate>
      </body>

    </html>
  );
}
