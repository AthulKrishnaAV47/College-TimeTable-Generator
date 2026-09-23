import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Term Timetable Generator — MyCamu Slot Sheet Planner",
  description:
    "Pick a valid, conflict-free class timetable for a single term from a MyCamu slot sheet, SBC/FC eligibility rules and your completed-course history.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
