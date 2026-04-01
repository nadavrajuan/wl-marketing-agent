"use client";
import { useEffect, useState } from "react";

interface KwRow {
  keyword: string;
  total_events: string;
  quiz_starts: string;
  purchases: string;
  revenue: string;
  purchase_rate: string | null;
}

export default function TopKeywordsTable() {
  const [data, setData] = useState<KwRow[]>([]);

  useEffect(() => {
    fetch("/api/keywords?limit=15").then((r) => r.json()).then(setData);
  }, []);

  return (
    <div className="overflow-auto max-h-64">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left py-1 pr-3 font-medium">Keyword</th>
            <th className="text-right py-1 pr-3 font-medium">Events</th>
            <th className="text-right py-1 pr-3 font-medium">Purchases</th>
            <th className="text-right py-1 font-medium">CVR</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 15).map((row) => (
            <tr key={row.keyword} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-1 pr-3 text-gray-200 truncate max-w-[150px]">{row.keyword}</td>
              <td className="py-1 pr-3 text-right text-gray-400">{Number(row.total_events).toLocaleString()}</td>
              <td className="py-1 pr-3 text-right text-emerald-400">{row.purchases}</td>
              <td className="py-1 text-right text-gray-400">
                {row.purchase_rate ? `${row.purchase_rate}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
