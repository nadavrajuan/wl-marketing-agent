"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";

interface Props {
  stats: {
    quizStarts: number;
    quizCompletes: number;
    addToCarts: number;
    purchases: number;
  };
}

const COLORS = ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981"];

export default function FunnelChart({ stats }: Props) {
  const data = [
    { name: "Quiz Start", value: stats.quizStarts },
    { name: "Quiz Complete", value: stats.quizCompletes },
    { name: "Add to Cart", value: stats.addToCarts },
    { name: "Purchase", value: stats.purchases },
  ];

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical">
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "#d1d5db" }}
            tickLine={false}
            axisLine={false}
            width={90}
          />
          <Tooltip
            contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="value" radius={4} name="Count">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
        {data.slice(1).map((step, i) => {
          const prev = data[i].value;
          const pct = prev > 0 ? ((step.value / prev) * 100).toFixed(1) : "0";
          return (
            <div key={step.name} className="bg-gray-800 rounded-lg px-2 py-1">
              <span className="text-gray-500">{data[i].name} → {step.name}: </span>
              <span className="text-white font-medium">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
