// src/app/org/[id]/page.tsx
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
import AppShell from "@/components/AppShell";

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

  // ---------- Members / Invites ----------
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

  // ---------- Load basics ----------
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

  // auto-claim invite on sign-in if my email matches
  const claimMyInviteIfAny = async () => {
    if (!id || !user || !myEmail) return;

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

    await supabase.from("memberships").insert({
      organisation_id: id,
      user_id: user.id,
      email: myEmail,
      role: pending.role,
    });

    await supabase.from("invites").update({ status: "accepted" }).eq("id", pending.id);
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

  // ---------- Members: invite / revoke / remove ----------
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
    <AppShell title="Organisation">
      {/* Back link (optional) */}
      <div className="text-sm text-zinc-400">
        <Link href="/dashboard" className="text-sky-400 hover:underline">← Back to Dashboard</Link>
      </div>

      {/* Members */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-lg font-medium">Members</h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            placeholder="Invite by email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="w-72 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={inviteMember}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-200"
          >
            Send Invite
          </button>
        </div>

        <h3 className="text-sm font-medium text-zinc-300">Current members</h3>
        {!members.length && <p className="text-zinc-400">No members yet (besides owner). Invite someone above.</p>}
        <ul className="divide-y divide-zinc-800">
          {members.map((m, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <div className="text-sm">
                {m.email || "(no email)"} — {m.role}
                {m.user_id ? " ✓" : " (not yet accepted)"}
              </div>
              <button
                onClick={() => removeMember(m.email || null, m.user_id || null)}
                className="text-sm text-red-400 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <h3 className="mt-4 text-sm font-medium text-zinc-300">Pending invites</h3>
        {!invites.filter((iv) => iv.status === "pending").length && <p className="text-zinc-400">No pending invites.</p>}
        <ul className="divide-y divide-zinc-800">
          {invites
            .filter((iv) => iv.status === "pending")
            .map((iv) => (
              <li key={iv.id} className="flex items-center justify-between py-2">
                <div className="text-sm">{iv.email} — {iv.role} — {iv.status}</div>
                <button onClick={() => revokeInvite(iv.id)} className="text-sm text-yellow-400 hover:underline">
                  Revoke
                </button>
              </li>
            ))}
        </ul>
      </section>

      {/* Subsidiaries */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-lg font-medium">Subsidiaries</h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            placeholder="Subsidiary name"
            value={subsName}
            onChange={(e) => setSubsName(e.target.value)}
            className="w-72 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <button
            onClick={createSubsidiary}
            disabled={savingSubs}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
          >
            {savingSubs ? "Saving…" : "Add"}
          </button>
        </div>
        {!subs.length && <p className="text-zinc-400">No subsidiaries yet.</p>}
        <ul className="divide-y divide-zinc-800">
          {subs.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-zinc-400">{new Date(s.created_at).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Metrics */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-lg font-medium">Metrics</h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            placeholder="Metric name (e.g., Monthly Revenue)"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            className="w-72 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <input
            placeholder="Unit (e.g., INR, %, USD)"
            value={metricUnit}
            onChange={(e) => setMetricUnit(e.target.value)}
            className="w-40 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <button
            onClick={createMetric}
            disabled={savingMetric}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
          >
            {savingMetric ? "Saving…" : "Add"}
          </button>
        </div>
        {!metrics.length && <p className="text-zinc-400">No metrics yet.</p>}
        <ul className="divide-y divide-zinc-800">
          {metrics.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">
                  {m.name} {m.unit ? <span className="text-zinc-400">({m.unit})</span> : null}
                </div>
                <div className="text-xs text-zinc-400">{new Date(m.created_at).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Entries + Chart */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-lg font-medium">Metric Entries</h2>

        {/* Metric selector */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-zinc-300">Metric:</label>
          <select
            value={selectedMetricId}
            onChange={(e) => setSelectedMetricId(e.target.value)}
            className="w-72 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          >
            <option value="">-- choose a metric --</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.unit ? `(${m.unit})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Add entry */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="Value"
            value={entryValue}
            onChange={(e) => setEntryValue(e.target.value)}
            className="w-40 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <input
            placeholder="Notes (optional)"
            value={entryNotes}
            onChange={(e) => setEntryNotes(e.target.value)}
            className="w-80 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <button
            onClick={createEntry}
            disabled={savingEntry || !selectedMetricId}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
          >
            {savingEntry ? "Saving…" : "Add Entry"}
          </button>
        </div>

        {/* Chart */}
        <div className="mt-4 h-80 rounded-md border border-zinc-800 bg-zinc-950 p-3">
          {!selectedMetric && <p className="text-zinc-400">Please select a metric above to see its chart.</p>}
          {selectedMetric && entries.length === 0 && <p className="text-zinc-400">No entries yet. Add one above.</p>}
          {selectedMetric && entries.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={entries.map((e) => ({ date: format(new Date(e.ts), "yyyy-MM-dd"), value: e.value }))}
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

        {/* Recent entries */}
        <div className="mt-3">
          <h3 className="text-sm font-medium text-zinc-300">Recent Entries</h3>
          {entries.length === 0 ? (
            <p className="text-zinc-400">None yet.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {[...entries]
                .slice(-10)
                .reverse()
                .map((e) => (
                  <li key={e.id} className="text-sm">
                    {format(new Date(e.ts), "yyyy-MM-dd")} — {e.value}
                    {e.notes ? <span className="text-zinc-400"> • {e.notes}</span> : null}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>
    </AppShell>
  );
}
