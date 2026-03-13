import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heisck Laundry Tracker",
  description: "Laundry package tracking with weekly reporting and Arkesel SMS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
