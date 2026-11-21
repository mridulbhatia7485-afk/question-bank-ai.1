import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Question Bank AI",
  description: "Organise, search and export your question bank.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
