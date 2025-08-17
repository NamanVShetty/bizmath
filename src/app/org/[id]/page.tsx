"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

// ---------- Types ----------
type Subs = { id: string; name: string; created_at: string };
type Metric = { id: string; name: string; unit: string | null; created_at: string };
type Entry = { id: number; ts: string; value: number; notes: string | null };
type Member = { user_id: string | null; email: string | null; role: string; created_at: string };
type Invite = { id: string; email: string; role: string; status: string; created_at: string };

// Small util
const lc = (s: string) => s.trim().toLowerCase();

export default function OrgPage() {
  const { id } = useParams<{ id: string }>(); // organisation id from URL
  const router = useRouter();
  const { isSignedIn, user } = useUser();

  // protect page
  useEffect(() => {
    if (isSignedIn === false) router.push("/sign-in");
  }, [isSignedIn, router]);

  // ---------- Members / Invites state ----------
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const myEmail = useMemo(() => lc(user?.primaryEmailAddress?.emailAddress || ""), [user]);

  // ---------- Subsidiaries ----------
  const [subsName, setSubsName] = useState("");
  const [subs, setSubs] = useState<Subs[]>([]);
  const [savingSubs, setSavingSubs] = useState(false);

  // ---------- Metrics ----------
  const [metricName, setMetricName] = useState("");
  const [metricUnit, setMetricUnit] = useState("");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [savingMetric, setSavingMetric] = useState(false);

  // ---------- Entries / Chart ----------
  const [selectedMetricId, setSelectedMetricId] = useState<string>("");
  const [entryDate, setEntryDate] = useState<string>(""); // yyyy-mm-dd
  const [entryValue, setEntryValue] = useState<string>("");
  const [entryNotes, setEntryNotes] = useState<string>("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [savingEntry, setSavingEntry] = useState(false);
  const selectedMetric = useMemo(
    () => metrics.find((m) => m.id === selectedMetricId) || null,
    [metrics, selectedMetricId]
  );

  // ---------- Load basics (subs, metrics, members, invites) ----------
  const loadBasics = async () => {
    if (!id) return;

    // subsidiaries
    const { data: sData } = await supabase
      .from("subsidiaries")
      .select("id,name,created_at")
      .eq("organisation_id", id)
      .order("created_at", { ascending: false });
    setSubs((sData || []) as Subs[]);

    // metrics
    const { data: mData } = await supabase
      .from("metric_definitions")
      .select("id,name,unit,created_at")
      .eq("organisation_id", id)
      .order("created_at", { ascending: false });
    const m = (mData || []) as Metric[];
    setMetrics(m);
    if (m.length && !selectedMetricId) setSelectedMetricId(m[0].id);

    // members
    const { data: memData } = await supabase
      .from("memberships")
      .select("user_id,email,role,created_at")
      .eq("organisation_id", id)
      .order("created_at", { ascending: false });
    setMembers((memData || []) as Member[]);

    // invites
    const { data: invData } = await supabase
      .from("invites")
      .select("id,email,role,status,created_at")
      .eq("organisation_id", id)
      .order("created_at", { ascending: false });
    setInvites((invData || []) as Invite[]);
  };

  // auto-claim an invite if my email matches a pending invite
  const claimMyInviteIfAny = async () => {
    if (!id || !user || !myEmail) return;

    // already a member? skip
    const already = members.some((m) => lc(m.email || "") === myEmail || m.user_id === user.id);
    if (already) return;

    const { data: pending } = await supabase
      .from("invites")
      .select("id,email,role,status")
      .eq("organisation_id", id)
      .eq("email", myEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (!pending) return;

    // add to memberships
    await supabase.from("memberships").insert({
      organisation_id: id,
      user_id: user.id,
      email: myEmail,
      role: pending.role,
    });

    // mark invite accepted
    await supabase.from("invites").update({ status: "accepted" }).eq("id", pending.id);

    // reload lists
    await loadBasics();
  };

  useEffect(() => {
    loadBasics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    claimMyInviteIfAny();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, myEmail]);

  // ---------- Members: invite, revoke, remove ----------
  const inviteMember = async () => {
    if (!id) return;
    const email = lc(inviteEmail);
    if (!email || !email.includes("@")) return alert("Enter a valid email");
    await supabase
      .from("invites")
      .upsert({ organisation_id: id, email, role: inviteRole, status: "pending" }, { onConflict: "organisation_id,email" });
    setInviteEmail("");
    await loadBasics();
    alert("Invite recorded. Share your site link with them; when they sign up, the invite auto-accepts.");
  };

  const revokeInvite = async (inviteId: string) => {
    await supabase.from("invites").update({ status: "revoked" }).eq("id", inviteId);
    await loadBasics();
  };

  const removeMember = async (email: string | null, userId: string | null) => {
    if (!id) return;
    // don't let user remove themselves for now
    if (lc(email || "") === myEmail) return alert("You can't remove yourself here.");
    if (userId) {
      await supabase.from("memberships").delete().eq("organisation_id", id).eq("user_id", userId);
    } else if (email) {
      await supabase.from("memberships").delete().eq("organisation_id", id).is("user_id", null).eq("email", lc(email));
    }
    await loadBasics();
  };

  // ---------- Entries ----------
  const loadEntries = async (metricId: string) => {
    if (!id || !metricId) return;
    const { data } = await supabase
      .from("entries")
      .select("id, ts, value, notes")
      .eq("organisation_id", id)
      .eq("metric_id", metricId)
      .order("ts", { ascending: true });
    setEntries((data || []) as Entry[]);
  };

  useEffect(() => {
    if (selectedMetricId) loadEntries(selectedMetricId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetricId]);

  const createSubsidiary = async () => {
    const name = subsName.trim();
    if (!id || !name) return;
    setSavingSubs(true);
    const { data, error } = await supabase
      .from("subsidiaries")
      .insert({ organisation_id: id, name })
      .select("id,name,created_at")
      .single();
    setSavingSubs(false);
    if (error) return alert("Failed: " + error.message);
    setSubsName("");
    setSubs((prev) => [data as Subs, ...prev]);
  };

  const createMetric = async () => {
    const name = metricName.trim();
    const unit = metricUnit.trim() || null;
    if (!id || !name) return;
    setSavingMetric(true);
    const { data, error } = await supabase
      .from("metric_definitions")
      .insert({ organisation_id: id, name, unit })
      .select("id,name,unit,created_at")
      .single();
    setSavingMetric(false);
    if (error) return alert("Failed: " + error.message);
    setMetricName("");
    setMetricUnit("");
    setMetrics((prev) => [data as Metric, ...prev]);
    if (!selectedMetricId && data) setSelectedMetricId(data.id as string);
  };

  const createEntry = async () => {
    if (!id || !selectedMetricId) return;
    const trimmed = entryValue.trim();
    if (!trimmed || !entryDate) return alert("Please fill date and value");
    const valueNum = Number(trimmed);
    if (Number.isNaN(valueNum)) return alert("Value must be a number");
    setSavingEntry(true);
    const isoTs = new Date(`${entryDate}T00:00:00Z`).toISOString();
    const { data, error } = await supabase
      .from("entries")
      .insert({ organisation_id: id, metric_id: selectedMetricId, ts: isoTs, value: valueNum, notes: entryNotes.trim() || null })
      .select("id, ts, value, notes")
      .single();
    setSavingEntry(false);
    if (error) return alert("Failed to add entry: " + error.message);
    setEntryValue(""); setEntryNotes("");
    setEntries((prev) => {
      const next = [...prev, data as Entry];
      next.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
      return next;
    });
  };

  if (isSignedIn === false) return null;

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <div>
        <Link href="/dashboard" style={{ color: "#4ea8de", textDecoration: "underline" }}>
          ← Back to Dashboard
        </Link>
      </div>

      <h1>Organisation</h1>

      {/* ---------------- Members ---------------- */}
      <section style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
        <h2>Members</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            placeholder="Invite by email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 260 }}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={inviteMember}
            style={{ padding: "8px 12px", borderRadius: 6, background: "black", color: "white" }}
          >
            Send Invite
          </button>
        </div>

        {/* Current members */}
        <h3>Current members</h3>
        {!members.length && <p>No members yet (besides owner). Invite someone above.</p>}
        <ul style={{ lineHeight: 1.9 }}>
          {members.map((m, i) => (
            <li key={i}>
              {m.email || "(no email)"} — {m.role}
              {m.user_id ? " ✓" : " (not yet accepted)"}
              <button
                onClick={() => removeMember(m.email || null, m.user_id || null)}
                style={{ marginLeft: 12 }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        {/* Pending invites */}
        <h3 style={{ marginTop: 16 }}>Pending invites</h3>
        {!invites.filter((iv) => iv.status === "pending").length && <p>No pending invites.</p>}
        <ul style={{ lineHeight: 1.9 }}>
          {invites
            .filter((iv) => iv.status === "pending")
            .map((iv) => (
              <li key={iv.id}>
                {iv.email} — {iv.role} — {iv.status}
                <button onClick={() => revokeInvite(iv.id)} style={{ marginLeft: 12 }}>
                  Revoke
                </button>
              </li>
            ))}
        </ul>
      </section>

      {/* ---------------- Subsidiaries ---------------- */}
      <section>
        <h2>Subsidiaries</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            placeholder="Subsidiary name"
            value={subsName}
            onChange={(e) => setSubsName(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 260 }}
          />
          <button
            onClick={createSubsidiary}
            disabled={savingSubs}
            style={{ padding: "8px 12px", borderRadius: 6, background: "black", color: "white" }}
          >
            {savingSubs ? "Saving..." : "Add"}
          </button>
        </div>
        {!subs.length && <p>No subsidiaries yet.</p>}
        <ul style={{ lineHeight: 1.9 }}>
          {subs.map((s) => (
            <li key={s.id}>
              {s.name} <span style={{ color: "#888" }}>({new Date(s.created_at).toLocaleString()})</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- Metrics ---------------- */}
      <section>
        <h2>Metrics</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            placeholder="Metric name (e.g., Monthly Revenue)"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 260 }}
          />
          <input
            placeholder="Unit (e.g., INR, %, USD)"
            value={metricUnit}
            onChange={(e) => setMetricUnit(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 160 }}
          />
          <button
            onClick={createMetric}
            disabled={savingMetric}
            style={{ padding: "8px 12px", borderRadius: 6, background: "black", color: "white" }}
          >
            {savingMetric ? "Saving..." : "Add"}
          </button>
        </div>
        {!metrics.length && <p>No metrics yet.</p>}
        <ul style={{ lineHeight: 1.9 }}>
          {metrics.map((m) => (
            <li key={m.id}>
              {m.name} {m.unit ? <span style={{ color: "#888" }}>({m.unit})</span> : null}{" "}
              <span style={{ color: "#888" }}>— {new Date(m.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- Entries + Chart ---------------- */}
      <section>
        <h2>Metric Entries</h2>

        {/* Metric selector */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>Metric:</label>
          <select
            value={selectedMetricId}
            onChange={(e) => setSelectedMetricId(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 260 }}
          >
            <option value="">-- choose a metric --</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.unit ? `(${m.unit})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Add entry form */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="Value"
            value={entryValue}
            onChange={(e) => setEntryValue(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 160 }}
          />
          <input
            placeholder="Notes (optional)"
            value={entryNotes}
            onChange={(e) => setEntryNotes(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 280 }}
          />
          <button
            onClick={createEntry}
            disabled={savingEntry || !selectedMetricId}
            style={{ padding: "8px 12px", borderRadius: 6, background: "black", color: "white" }}
          >
            {savingEntry ? "Saving..." : "Add Entry"}
          </button>
        </div>

        {/* Chart */}
        <div style={{ height: 320, marginTop: 16, background: "#0a0a0a", padding: 12, borderRadius: 8 }}>
          {!selectedMetric && <p>Please select a metric above to see its chart.</p>}
          {selectedMetric && entries.length === 0 && <p>No entries yet. Add one above.</p>}
          {selectedMetric && entries.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={entries.map((e) => ({
                  date: format(new Date(e.ts), "yyyy-MM-dd"),
                  value: e.value,
                }))}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Last 10 entries list */}
        <div style={{ marginTop: 12 }}>
          <h3>Recent Entries</h3>
          {entries.length === 0 ? (
            <p>None yet.</p>
          ) : (
            <ul style={{ lineHeight: 1.8 }}>
              {[...entries]
                .slice(-10)
                .reverse()
                .map((e) => (
                  <li key={e.id}>
                    {format(new Date(e.ts), "yyyy-MM-dd")} — {e.value}
                    {e.notes ? <span style={{ color: "#888" }}> • {e.notes}</span> : null}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
