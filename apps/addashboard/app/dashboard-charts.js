"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const NAVY = "#0b1f3a";

const FLAG_TYPE_LABELS = {
  dark_pattern: "Dark pattern",
  age_mismatch_category: "Age-restricted category",
  unverified_ad_network: "Unverified network",
  missing_accessible_text: "No accessible text",
  needs_human_review: "Needs review"
};

function Chart({ title, data, dataKey, labelKey, labelMap }) {
  const rows = data.map((d) => ({
    label: labelMap ? labelMap[d[labelKey]] || d[labelKey] : d[labelKey],
    count: d.count
  }));

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: "bold", marginBottom: 12 }}>
        {title}
      </h2>
      <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 44)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontFamily: "Arial", fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="label"
            width={170}
            tick={{ fontFamily: "Arial", fontSize: 12.5 }}
          />
          <Tooltip
            contentStyle={{ fontFamily: "Arial", fontSize: 13, border: "1px solid #111" }}
            cursor={{ fill: "#f4f4f4" }}
          />
          <Bar dataKey="count" fill={NAVY} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardCharts({ stats }) {
  const childDirected = stats.childDirectedShare.find((r) => r.childDirected === true)?.count || 0;
  const notChildDirected = stats.childDirectedShare.find((r) => r.childDirected === false)?.count || 0;
  const totalReports = childDirected + notChildDirected;

  return (
    <div>
      <Chart title="Flags by platform" data={stats.byPlatform} labelKey="platform" />
      <Chart title="Flags by type" data={stats.byFlagType} labelKey="flagType" labelMap={FLAG_TYPE_LABELS} />
      {stats.byCategory.length > 0 && (
        <Chart title="Age-restricted category breakdown" data={stats.byCategory} labelKey="category" />
      )}
      {totalReports > 0 && (
        <p style={{ fontFamily: "Arial", fontSize: 13, color: "#6b6b6b" }}>
          {childDirected} of {totalReports} reports ({Math.round((childDirected / totalReports) * 100)}%) came from
          pages that looked child-directed.
        </p>
      )}
    </div>
  );
}
