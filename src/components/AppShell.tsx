// src/components/AppShell.tsx
"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function AppShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              <span className="inline-block rounded-lg bg-zinc-800 px-2 py-1 text-sm">Biz Math</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-4 text-sm text-zinc-300">
              <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <UserButton />
          </div>
        </div>
      </header>

      {/* Page */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {title ? <h1 className="text-2xl font-semibold mb-4">{title}</h1> : null}
        <div className="grid gap-4">{children}</div>
      </main>
    </div>
  );
}
