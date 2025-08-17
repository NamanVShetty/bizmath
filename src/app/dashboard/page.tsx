// src/app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser, UserButton, SignOutButton } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";

type Org = { id: string; name: string; created_at: string };

export default function DashboardPage() {
  const { isSignedIn, user } = useUser();
  const router = useRouter();

  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);

  useEffect(() => {
    if (isSignedIn === false) router.push("/sign-in");
  }, [isSignedIn, router]);

  const loadOrgs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("organisations")
      .select("id, name, created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false });
    setOrgs((data || []) as Org[]);
  };

  useEffect(() => {
    loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const createOrg = async () => {
    const name = orgName.trim();
    if (!user || !name) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("organisations")
      .insert({ name, owner_user_id: user.id })
      .select("id, name, created_at")
      .single();
    setSaving(false);
    if (error) {
      alert("Failed to create organisation: " + error.message);
      return;
    }
    setOrgName("");
    setOrgs((prev) => [data as Org, ...prev]);
  };

  if (!isSignedIn) return null;

  return (
    <AppShell title="Dashboard">
      {/* quick actions */}
      <div className="flex items-center gap-3">
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Organisation name"
          className="w-80 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
        />
        <button
          onClick={createOrg}
          disabled={saving}
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <SignOutButton />
          <UserButton />
        </div>
      </div>

      {/* list */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-lg font-medium">Your Organisations</h2>
        {!orgs.length && <p className="text-zinc-400">No organisations yet. Create one above.</p>}
        <ul className="divide-y divide-zinc-800">
          {orgs.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-zinc-400">
                  {new Date(o.created_at).toLocaleString()}
                </div>
              </div>
              <Link href={`/org/${o.id}`} className="text-sm text-sky-400 hover:underline">
                Open →
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
