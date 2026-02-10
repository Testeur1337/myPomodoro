import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MyPomodoro",
  description: "Client-only MyPomodoro build for Netlify"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
