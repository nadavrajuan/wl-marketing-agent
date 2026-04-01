"use client";
import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function PlatformPie() {
  const [data, setData] = useState<{ segment: string; total_events: string }[]>([]);

  useEffect(() => {
    fetch("/api/segments?group_by=platform_id").then((r) => r.json()).then(setData);
  }, []);

  const formatted = data
    .filter((d) => d.segment !== "unknown")
    .map((d) => ({ name: d.segment, value: Number(d.total_events) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={formatted}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {formatted.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
