"use client";

import { Inter } from "next/font/google";
import "./globals.css";
import "./dark-theme.css";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider, THEME_SCRIPT } from "./context/ThemeContext";
import AppShell from "./_components/AppShell";

const inter = Inter({ subsets: ["latin"] });

// Staff get a grouped sidebar (drawer on mobile); customers and visitors get a
// simple top bar — see AppShell.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The head script sets the "dark" class before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen`}>
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
