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

type Subs = { id: string; name: string; created_at: string };
type Metric = { id: string; name: string; unit: string | null; created_at: string };
type Entry = { id: number; ts: string; value: number; notes: string | null };

export default function OrgPage() {
  const { id } = useParams<{ id: string }>(); // organisation id from URL
  const router = useRouter();
  const { isSignedIn } = useUser();

  // protect the page
  useEffect(() => {
    if (isSignedIn === false) router.push("/sign-in");
  }, [isSignedIn, router]);

  // ===== Subsidiaries =====
  const [subsName, setSubsName] = useState("");
  const [subs, setSubs] = useState<Subs[]>([]);
  const [savingSubs, setSavingSubs] = useState(false);

  // ===== Metrics =====
  const [metricName, setMetricName] = useState("");
  const [metricUnit, setMetricUnit] = useState("");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [savingMetric, setSavingMetric] = useState(false);

  // ===== Entries =====
  const [selectedMetricId, setSelectedMetricId] = useState<string>("");
  const [entryDate, setEntryDate] = useState<string>(""); // yyyy-mm-dd
  const [entryValue, setEntryValue] = useState<string>(""); // string to capture user input
  const [entryNotes, setEntryNotes] = useState<string>("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [savingEntry, setSavingEntry] = useState(false);

  const selectedMetric = useMemo(
    () => metrics.find((m) => m.id === selectedMetricId) || null,
    [metrics, selectedMetricId]
  );

  // ---------- Load subsidiaries & metrics ----------
  const loadBasics = async () => {
    if (!id) return;

    const { data: sData } = await supabase
      .from("subsidiaries")
      .select("id,name,created_at")
      .eq("organisation_id", id)
      .order("created_at", { ascending: false });
    setSubs((sData || []) as Subs[]);

    const { data: mData } = await supabase
      .from("metric_definitions")
      .select("id,name,unit,created_at")
      .eq("organisation_id", id)
      .order("created_at", { ascending: false });
    const m = (mData || []) as Metric[];
    setMetrics(m);

    // pick first metric by default so the page "just works"
    if (m.length && !selectedMetricId) setSelectedMetricId(m[0].id);
  };

  // ---------- Load entries for selected metric ----------
  const loadEntries = async (metricId: string) => {
    if (!id || !metricId) return;
    const { data, error } = await supabase
      .from("entries")
      .select("id, ts, value, notes")
      .eq("organisation_id", id)
      .eq("metric_id", metricId)
      .order("ts", { ascending: true });

    if (!error && data) setEntries(data as Entry[]);
  };

  useEffect(() => {
    loadBasics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (selectedMetricId) loadEntries(selectedMetricId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetricId]);

  // ---------- Create subsidiary ----------
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

  // ---------- Create metric ----------
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
    // if no metric is selected, select this one
    if (!selectedMetricId && data) setSelectedMetricId(data.id as string);
  };

  // ---------- Create entry ----------
  const createEntry = async () => {
    if (!id || !selectedMetricId) return;

    const trimmed = entryValue.trim();
    if (!trimmed || !entryDate) {
      alert("Please fill date and value");
      return;
    }

    const valueNum = Number(trimmed);
    if (Number.isNaN(valueNum)) {
      alert("Value must be a number");
      return;
    }

    setSavingEntry(true);

    // Convert 'yyyy-mm-dd' to an ISO datetime at midnight UTC
    const isoTs = new Date(`${entryDate}T00:00:00Z`).toISOString();

    const { data, error } = await supabase
      .from("entries")
      .insert({
        organisation_id: id,
        metric_id: selectedMetricId,
        ts: isoTs,
        value: valueNum,
        notes: entryNotes.trim() || null,
      })
      .select("id, ts, value, notes")
      .single();

    setSavingEntry(false);

    if (error) {
      alert("Failed to add entry: " + error.message);
      return;
    }

    // reset inputs
    setEntryValue("");
    setEntryNotes("");

    // update list
    setEntries((prev) => {
      const next = [...prev, data as Entry];
      // keep sorted by ts
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

      {/* Subsidiaries */}
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
              {s.name}{" "}
              <span style={{ color: "#888" }}>({new Date(s.created_at).toLocaleString()})</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Metrics */}
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

      {/* Entries */}
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
