"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";

type Subs = { id: string; name: string; created_at: string };
type Metric = { id: string; name: string; unit: string | null; created_at: string };

export default function OrgPage() {
  const { id } = useParams<{ id: string }>(); // organisation id from URL
  const router = useRouter();
  const { isSignedIn } = useUser();

  // protect the page
  useEffect(() => {
    if (isSignedIn === false) router.push("/sign-in");
  }, [isSignedIn, router]);

  const [subsName, setSubsName] = useState("");
  const [subs, setSubs] = useState<Subs[]>([]);
  const [savingSubs, setSavingSubs] = useState(false);

  const [metricName, setMetricName] = useState("");
  const [metricUnit, setMetricUnit] = useState("");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [savingMetric, setSavingMetric] = useState(false);

  const loadData = async () => {
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
    setMetrics((mData || []) as Metric[]);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    </main>
  );
}
