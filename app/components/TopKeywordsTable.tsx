"use client";
import { useEffect, useState } from "react";

interface KwRow {
  platform_id: string;
  keyword: string;
  visits: string;
  net_purchases: string;
  purchase_profit: string;
  purchase_roi_pct: string | null;
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
            <th className="text-left py-1 pr-3 font-medium">Platform</th>
            <th className="text-right py-1 pr-3 font-medium">Purchases</th>
            <th className="text-right py-1 pr-3 font-medium">Profit</th>
            <th className="text-right py-1 font-medium">ROI</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 15).map((row) => (
            <tr key={`${row.platform_id}:${row.keyword}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-1 pr-3 text-gray-200 truncate max-w-[150px]">{row.keyword}</td>
              <td className="py-1 pr-3 text-xs text-gray-400">{row.platform_id}</td>
              <td className="py-1 pr-3 text-right text-emerald-400">{Number(row.net_purchases).toLocaleString()}</td>
              <td className={`py-1 pr-3 text-right ${Number(row.purchase_profit) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                ${Number(row.purchase_profit || 0).toLocaleString()}
              </td>
              <td className="py-1 text-right text-gray-400">
                {row.purchase_roi_pct ? `${row.purchase_roi_pct}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
