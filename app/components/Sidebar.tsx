"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/campaigns", label: "Campaigns", icon: "🎯" },
  { href: "/keywords", label: "Keywords", icon: "🔍" },
  { href: "/explorer", label: "Data Explorer", icon: "🗂️" },
  { href: "/segments", label: "Segments", icon: "📈" },
  { href: "/schema", label: "Data Schema", icon: "🧬" },
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
        {nav.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-indigo-600 text-white font-medium"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2 pt-4 border-t border-gray-800">
        <a
          href="http://localhost:8003/agent/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-indigo-400 hover:text-white hover:bg-indigo-900/40 transition-colors"
        >
          <span className="text-base">⚡</span>
          AI Agent
        </a>
        <div className="px-3 pt-2 text-xs text-gray-600">
          Goal: Max conversions / Min price
        </div>
      </div>
    </aside>
  );
}
