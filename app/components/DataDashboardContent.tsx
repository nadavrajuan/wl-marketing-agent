"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = {
  value: string;
  label: string;
};

type MatrixRow = {
  channel: string;
  cost: number;
  payout: number;
  nmr: number;
  projected_nmr: number;
  roas_pct: number | null;
  clicks: number;
  clickouts: number;
  cpco: number | null;
  lp_ctr_pct: number | null;
  step1: number;
  cost_per_step1: number | null;
  step2: number;
  cost_per_step2: number | null;
  step3: number;
  cost_per_step3: number | null;
};

type PartnerRow = {
  partner: string;
  payout: number;
  epc: number | null;
  epv: number | null;
  clickouts: number;
  clickshare_pct: number | null;
  step1: number;
  step2: number;
};

type UrlRow = {
  landing_page_url: string;
  cost: number;
  payout: number;
  nmr: number;
  projected_nmr: number;
  clicks: number;
  clickouts: number;
  lp_ctr_pct: number | null;
  step1: number;
  cost_per_step1: number | null;
};

type DashboardResponse = {
  filters: {
    account: string;
    defaults: {
      date_from: string;
      date_to: string;
    };
    channel_options: Option[];
    campaign_options: Option[];
    campaign_type_options: Option[];
    device_options: Option[];
    partner_options: Option[];
  };
  latest_data_date: string;
  metrics: {
    cost: number;
    payout: number;
    nmr: number;
    projected_nmr: number;
    roas_pct: number | null;
    lp_ctr_pct: number | null;
    clicks: number;
    epv: number | null;
    clickouts: number;
    cpco: number | null;
    visits: number;
    cpv: number | null;
    add_to_carts: number;
    cpatc: number | null;
    net_purchases: number;
    cpa: number | null;
    quiz_starts: number;
  };
  channel_breakdown: MatrixRow[];
  partner_breakdown: PartnerRow[];
  url_breakdown: UrlRow[];
};

function money(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function number(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function metricTone(tone: "orange" | "green" | "blue" | "purple" | "default") {
  switch (tone) {
    case "orange":
      return "border-orange-500/40 bg-orange-500/10";
    case "green":
      return "border-emerald-500/40 bg-emerald-500/10";
    case "blue":
      return "border-sky-500/40 bg-sky-500/10";
    case "purple":
      return "border-violet-500/40 bg-violet-500/10";
    default:
      return "border-gray-800 bg-gray-900";
  }
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "orange" | "green" | "blue" | "purple" | "default";
}) {
  return (
    <div className={`rounded-2xl border p-5 ${metricTone(tone)}`}>
      <div className="text-xs uppercase tracking-[0.18em] text-gray-400">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-sm text-gray-500">{sub}</div>
    </div>
  );
}

function PairMetricCard({
  leftValue,
  leftLabel,
  rightValue,
  rightLabel,
}: {
  leftValue: string;
  leftLabel: string;
  rightValue: string;
  rightLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="border-r border-gray-800 pr-4">
          <div className="text-2xl font-semibold tracking-tight text-white">{leftValue}</div>
          <div className="mt-1 text-sm text-gray-500">{leftLabel}</div>
        </div>
        <div className="pl-1">
          <div className="text-2xl font-semibold tracking-tight text-white">{rightValue}</div>
          <div className="mt-1 text-sm text-gray-500">{rightLabel}</div>
        </div>
      </div>
    </div>
  );
}

function channelLabel(value: string) {
  if (value === "total") return "Total";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function urlLabel(value: string) {
  if (value === "total") return "Total";
  return value;
}

export default function DataDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = searchParams.toString();
    fetch(`/api/data-dashboard${query ? `?${query}` : ""}`)
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Request failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((payload: DashboardResponse) => {
        setData(payload);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
        setLoading(false);
      });
  }, [searchParams]);

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    setLoading(true);
    router.push(`${pathname}?${params.toString()}`);
  };

  const activeDates = useMemo(() => {
    if (!data) return { from: "", to: "" };
    return {
      from: searchParams.get("date_from") || data.filters.defaults.date_from,
      to: searchParams.get("date_to") || data.filters.defaults.date_to,
    };
  }, [data, searchParams]);

  if (loading && !data) {
    return <div className="mt-10 text-center text-gray-400">Loading data dashboard...</div>;
  }

  if (error && !data) {
    return (
      <div className="mt-10 rounded-xl border border-rose-800 bg-rose-950/30 px-5 py-4 text-sm text-rose-200">
        Data Dashboard failed to load: {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.28em] text-cyan-300">WL Marketing</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Data Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-400">
            A channel-first control room for spend, payout, partner clickouts, and purchase efficiency across the full warehouse window.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Latest Data</div>
          <div className="mt-1 text-lg font-semibold text-white">{formatDate(data.latest_data_date)}</div>
          <div className="mt-1 text-xs text-gray-500">
            Window: {formatDate(activeDates.from)} to {formatDate(activeDates.to)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">Filters</div>
            <div className="mt-1 text-sm text-gray-500">
              Slice the same warehouse-backed metrics by media channel, campaign, device, and partner.
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-400">
            Account: <span className="text-gray-200">{data.filters.account}</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <FilterField label="Account">
            <select
              className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-400 outline-none"
              value={data.filters.account}
              disabled
            >
              <option>{data.filters.account}</option>
            </select>
          </FilterField>
          <FilterField label="Date From">
            <input
              type="date"
              className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 outline-none"
              value={activeDates.from}
              onChange={(event) => setFilter("date_from", event.target.value)}
            />
          </FilterField>
          <FilterField label="Date To">
            <input
              type="date"
              className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 outline-none"
              value={activeDates.to}
              onChange={(event) => setFilter("date_to", event.target.value)}
            />
          </FilterField>
          <FilterField label="Channel">
            <select
              className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 outline-none"
              value={searchParams.get("channel") || ""}
              onChange={(event) => setFilter("channel", event.target.value)}
            >
              <option value="">All</option>
              {data.filters.channel_options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Campaign">
            <select
              className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 outline-none"
              value={searchParams.get("campaign") || ""}
              onChange={(event) => setFilter("campaign", event.target.value)}
            >
              <option value="">All</option>
              {data.filters.campaign_options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Campaign Type">
            <select
              className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 outline-none"
              value={searchParams.get("campaign_type") || ""}
              onChange={(event) => setFilter("campaign_type", event.target.value)}
            >
              <option value="">All</option>
              {data.filters.campaign_type_options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <div className="grid grid-cols-2 gap-4">
            <FilterField label="Device">
              <select
                className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 outline-none"
                value={searchParams.get("device") || ""}
                onChange={(event) => setFilter("device", event.target.value)}
              >
                <option value="">All</option>
                {data.filters.device_options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Partner">
              <select
                className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 outline-none"
                value={searchParams.get("partner") || ""}
                onChange={(event) => setFilter("partner", event.target.value)}
              >
                <option value="">All</option>
                {data.filters.partner_options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <MetricCard
          label="Cost"
          value={money(data.metrics.cost)}
          sub="Raw Google + Bing media cost"
          tone="orange"
        />
        <MetricCard
          label="Payout"
          value={money(data.metrics.payout)}
          sub="Net purchases × $390"
          tone="green"
        />
        <MetricCard
          label="NMR"
          value={money(data.metrics.nmr, 1)}
          sub="Purchase payout minus cost"
          tone={data.metrics.nmr >= 0 ? "blue" : "orange"}
        />
        <MetricCard
          label="Projected NMR"
          value={money(data.metrics.projected_nmr, 1)}
          sub="Adds weighted 25% ATC proxy"
          tone="purple"
        />
        <MetricCard
          label="LP CTR"
          value={pct(data.metrics.lp_ctr_pct)}
          sub="Partner clickouts per ad click"
          tone="default"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <PairMetricCard
          leftValue={number(data.metrics.clicks)}
          leftLabel="Clicks"
          rightValue={money(data.metrics.epv, 1)}
          rightLabel="EPV"
        />
        <PairMetricCard
          leftValue={number(data.metrics.clickouts)}
          leftLabel="Clickouts"
          rightValue={money(data.metrics.cpco, 1)}
          rightLabel="CPCO"
        />
        <PairMetricCard
          leftValue={number(data.metrics.visits)}
          leftLabel="Step 1 (Visits)"
          rightValue={money(data.metrics.cpv, 1)}
          rightLabel="Cost / Step 1"
        />
        <PairMetricCard
          leftValue={number(data.metrics.add_to_carts)}
          leftLabel="Step 2 (ATC)"
          rightValue={money(data.metrics.cpatc, 1)}
          rightLabel="Cost / Step 2"
        />
        <PairMetricCard
          leftValue={number(data.metrics.net_purchases)}
          leftLabel="Step 3 (Purchases)"
          rightValue={money(data.metrics.cpa, 1)}
          rightLabel="Cost / Step 3"
        />
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">Channel Matrix</div>
              <div className="mt-1 text-sm text-gray-500">
                Same metrics broken down by channel. Step 1 = visits, Step 2 = add to cart, Step 3 = net purchases.
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-400">
              Projected NMR includes a 25% purchase-value proxy for add to cart.
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1400px] w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-950 text-gray-400">
              <tr>
                {[
                  "Channel",
                  "Cost",
                  "Payout",
                  "NMR",
                  "Projected NMR",
                  "ROAS",
                  "Clicks",
                  "Clickouts",
                  "$CPCO",
                  "LP CTR",
                  "Step 1",
                  "Cost / Step 1",
                  "Step 2",
                  "Cost / Step 2",
                  "Step 3",
                  "Cost / Step 3",
                ].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em]"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.channel_breakdown.map((row, index) => {
                const isTotal = row.channel === "total";
                return (
                  <tr
                    key={`${row.channel}-${index}`}
                    className={isTotal ? "bg-white/[0.03]" : "border-t border-gray-800/80"}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                      {channelLabel(row.channel)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.cost)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.payout)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 ${row.nmr >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {money(row.nmr)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 ${row.projected_nmr >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                      {money(row.projected_nmr)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{pct(row.roas_pct)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.clicks)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.clickouts)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.cpco, 1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{pct(row.lp_ctr_pct)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.step1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.cost_per_step1, 1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.step2)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.cost_per_step2, 1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.step3)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.cost_per_step3, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">Partner Performance</div>
              <div className="mt-1 text-sm text-gray-500">
                Outbound click partners ranked by payout contribution, clickshare, and downstream conversion steps.
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-400">
              EPC = payout per clickout. EPV = payout per total ad click in the filtered window.
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-950 text-gray-400">
              <tr>
                {[
                  "Partner",
                  "Payout",
                  "$EPC",
                  "EPV",
                  "Clickout",
                  "%Clickshare",
                  "Step 1",
                  "Step 2",
                ].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em]"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.partner_breakdown.map((row, index) => {
                const isTotal = row.partner === "total";
                return (
                  <tr
                    key={`${row.partner}-${index}`}
                    className={isTotal ? "bg-white/[0.03]" : "border-t border-gray-800/80"}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                      {channelLabel(row.partner)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.payout)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.epc, 1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.epv, 1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.clickouts)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{pct(row.clickshare_pct)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.step1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.step2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">Analyze by URL</div>
              <div className="mt-1 text-sm text-gray-500">
                Landing-page level economics using visit-share media allocation, outbound clicks, and matched downstream conversion value.
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-400">
              Step 1 = add to cart. Cost is allocated to URL by visit share within date, channel, campaign, and device.
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-950 text-gray-400">
              <tr>
                {[
                  "URL",
                  "Cost",
                  "Payout",
                  "NMR",
                  "Projected NMR",
                  "Clicks",
                  "Clickouts",
                  "LP CTR",
                  "Step 1",
                  "Cost / Step 1",
                ].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em]"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.url_breakdown.map((row, index) => {
                const isTotal = row.landing_page_url === "total";
                return (
                  <tr
                    key={`${row.landing_page_url}-${index}`}
                    className={isTotal ? "bg-white/[0.03]" : "border-t border-gray-800/80"}
                  >
                    <td className={`px-4 py-3 ${isTotal ? "font-medium text-white" : "text-gray-200"}`}>
                      <div className={isTotal ? "" : "max-w-[760px] break-all"}>
                        {urlLabel(row.landing_page_url)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.cost)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.payout)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 ${row.nmr >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {money(row.nmr)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 ${row.projected_nmr >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                      {money(row.projected_nmr)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.clicks)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.clickouts)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{pct(row.lp_ctr_pct)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{number(row.step1)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-200">{money(row.cost_per_step1, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
