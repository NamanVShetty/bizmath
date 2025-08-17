"use client";

import { useEffect, useState } from "react";
import { useUser, UserButton, SignOutButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Org = { id: string; name: string; created_at: string };

export default function DashboardPage() {
  const { isSignedIn, user } = useUser();
  const router = useRouter();

  const [orgName, setOrgName] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [saving, setSaving] = useState(false);

  // redirect if not logged in
  useEffect(() => {
    if (isSignedIn === false) router.push("/sign-in");
  }, [isSignedIn, router]);

  // load orgs
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
  }, [user?.id]);

  // create org
  const createOrg = async () => {
    if (!user || !orgName.trim()) return;
    setSaving(true);

    const { data, error } = await supabase
      .from("organisations")
      .insert({ name: orgName.trim(), owner_user_id: user.id })
      .select("id, name, created_at")
      .single();

    setSaving(false);

    if (error) {
      alert("Error: " + error.message);
      return;
    }

    setOrgName("");
    setOrgs((prev) => [data as Org, ...prev]);
  };

  if (!isSignedIn) return null;

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <UserButton />
        <SignOutButton />
      </div>

      <h1>Dashboard</h1>

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

      <h2>Your Organisations</h2>
      {!orgs.length && <p>No organisations yet. Create one above.</p>}
      <ul style={{ lineHeight: 1.9 }}>
        {orgs.map((o) => (
          <li key={o.id}>
            {o.name} <span style={{ color: "#888" }}>({new Date(o.created_at).toLocaleString()})</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
