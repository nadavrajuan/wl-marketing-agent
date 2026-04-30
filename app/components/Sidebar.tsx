"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const agentUrl = process.env.NEXT_PUBLIC_AGENT_BASE_URL || "/agent/";

const nav = [
  { href: "/", label: "Action Board", icon: "📊" },
  { href: "/competitor-landscape", label: "Competitor Landscape", icon: "🛰️" },
  { href: "/data-dashboard", label: "Data Dashboard", icon: "🧮" },
  { href: "/recommendations", label: "Recommendations", icon: "🧭" },
  { href: "/copy-lab", label: "Copy Lab", icon: "🧠" },
  { href: "/campaigns", label: "Campaigns", icon: "🎯" },
  { href: "/keywords", label: "Keywords", icon: "🔍" },
  { href: "/search-queries", label: "Search Terms", icon: "🔎" },
  { href: "/explorer", label: "Data Explorer", icon: "🗂️" },
  { href: "/segments", label: "Segments", icon: "📈" },
  { href: "/schema", label: "Data Schema", icon: "🧬" },
  { href: agentUrl, label: "AI Agent", icon: "⚡", external: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col py-6 px-3 min-h-screen">
      <div className="mb-8 px-2">
        <div className="text-lg font-bold text-white tracking-tight">WL Marketing</div>
        <div className="text-xs text-gray-400 mt-0.5">Bing + Google Ads Analytics</div>
      </div>
      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label, icon, external }) => {
          const active = !external && pathname === href;
          const className = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            active
              ? "bg-indigo-600 text-white font-medium"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`;

          if (external) {
            return (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                <span className="text-base">{icon}</span>
                {label}
              </a>
            );
          }

          return (
            <Link key={href} href={href} className={className}>
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2 pt-4 border-t border-gray-800">
        <div className="px-3 pt-2 text-xs text-gray-600">
          Goal: Max conversions / Min price
        </div>
      </div>
    </aside>
  );
}
