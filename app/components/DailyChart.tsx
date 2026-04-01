"use client";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

interface DailyRow {
  date: string;
  total_events: string;
  quiz_starts: string;
  purchases: string;
  revenue: string;
}

export default function DailyChart() {
  const [data, setData] = useState<DailyRow[]>([]);

  useEffect(() => {
    fetch("/api/daily").then((r) => r.json()).then(setData);
  }, []);

  const formatted = data.map((d) => ({
    date: format(parseISO(d.date), "MMM d"),
    events: Number(d.total_events),
    quizStarts: Number(d.quiz_starts),
    purchases: Number(d.purchases),
    revenue: Number(d.revenue),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={formatted}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#e5e7eb" }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="events"
          stroke="#6366f1"
          fill="#6366f120"
          strokeWidth={2}
          name="Events"
          dot={false}
        />
        <Bar yAxisId="left" dataKey="purchases" fill="#10b981" name="Purchases" radius={2} />
        <Area
          yAxisId="right"
          type="monotone"
          dataKey="revenue"
          stroke="#f59e0b"
          fill="#f59e0b10"
          strokeWidth={1.5}
          name="Revenue $"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
