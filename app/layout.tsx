import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSession } from "@/lib/session";
import { logoutUser } from "@/app/actions/logoutUser";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vinyl Collection",
  description: "Personal vinyl record collection database",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {session && (
          <header className="flex items-center justify-end gap-4 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm text-zinc-500">
            <span>{session.email}</span>
            <form action={logoutUser}>
              <button type="submit" className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline">
                Log out
              </button>
            </form>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
