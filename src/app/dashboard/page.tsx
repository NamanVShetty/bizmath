"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser, UserButton, SignOutButton } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";

type Org = { id: string; name: string; created_at: string };

export default function DashboardPage() {
  // Clerk auth (client-side)
  const { isSignedIn, user } = useUser();
  const router = useRouter();

  // UI state
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);

  // If logged out, send to /sign-in
  useEffect(() => {
    if (isSignedIn === false) router.push("/sign-in");
  }, [isSignedIn, router]);

  // Load organisations for the current user
  const loadOrgs = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("organisations")
      .select("id, name, created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) setOrgs(data as Org[]);
  };

  useEffect(() => {
    loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Create a new organisation
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
    setOrgs((prev) => [data as Org, ...prev]); // show immediately
  };

  if (!isSignedIn) return null;

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      {/* header actions */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <UserButton />
        <SignOutButton />
      </div>

      <h1>Dashboard</h1>
      <p>Create your first Organisation below. It will be saved in Supabase.</p>

      {/* create org */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Organisation name"
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 260 }}
        />
        <button
          onClick={createOrg}
          disabled={saving}
          style={{ padding: "8px 12px", borderRadius: 6, background: "black", color: "white" }}
        >
          {saving ? "Saving..." : "Create"}
        </button>
      </div>

      {/* list orgs */}
      <h2>Your Organisations</h2>
      {!orgs.length && <p>No organisations yet. Create one above.</p>}
      <ul style={{ lineHeight: 1.9 }}>
        {orgs.map((o) => (
          <li key={o.id}>
            {o.name}
            <Link
              href={`/org/${o.id}`}
              style={{ marginLeft: 8, color: "#4ea8de", textDecoration: "underline" }}
            >
              Open
            </Link>
            <span style={{ color: "#888" }}> ({new Date(o.created_at).toLocaleString()})</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
