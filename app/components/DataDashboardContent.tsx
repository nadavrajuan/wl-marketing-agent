"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = {
  value: string;
  label: string;
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

function MiniMetric({
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
    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="grid grid-cols-2 gap-4 divide-x divide-gray-200">
        <div className="pr-4 text-center">
          <div className="text-4xl font-semibold tracking-tight text-gray-900">{leftValue}</div>
          <div className="mt-1 text-sm text-gray-500">{leftLabel}</div>
        </div>
        <div className="pl-4 text-center">
          <div className="text-4xl font-semibold tracking-tight text-gray-900">{rightValue}</div>
          <div className="mt-1 text-sm text-gray-500">{rightLabel}</div>
        </div>
      </div>
    </div>
  );
}

function BigMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[linear-gradient(180deg,#7bd43d_0%,#6fca39_100%)] px-6 py-6 text-center shadow-[0_10px_25px_rgba(111,202,57,0.28)]">
      <div className="text-5xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-sm uppercase tracking-[0.18em] text-lime-50/90">{label}</div>
    </div>
  );
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
    <div className="rounded-[28px] bg-[linear-gradient(180deg,#f4f4f2_0%,#ececea_100%)] p-6 text-gray-900 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <div className="rounded-full border border-gray-300 bg-white px-3 py-2 text-xl shadow-sm">◀</div>
            <div>
              <div className="text-[15px] font-medium uppercase tracking-[0.25em] text-lime-600">WL Marketing</div>
              <h1 className="text-5xl font-semibold tracking-tight text-gray-900">Data Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">Analyze by date, channel, campaign, device, and partner.</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Latest Data</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">
            {data.latest_data_date ? new Date(data.latest_data_date).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-[24px] border border-gray-200 bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Account</label>
            <select
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-inner outline-none"
              value={data.filters.account}
              disabled
            >
              <option>{data.filters.account}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Date From</label>
            <input
              type="date"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-inner outline-none"
              value={activeDates.from}
              onChange={(event) => setFilter("date_from", event.target.value)}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Date To</label>
            <input
              type="date"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-inner outline-none"
              value={activeDates.to}
              onChange={(event) => setFilter("date_to", event.target.value)}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Channel</label>
            <select
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-inner outline-none"
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
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Campaign</label>
            <select
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-inner outline-none"
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
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Campaign Type</label>
            <select
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-inner outline-none"
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
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Device</label>
              <select
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-inner outline-none"
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
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Partner</label>
              <select
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-inner outline-none"
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
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-5">
        <BigMetric label="Cost" value={number(data.metrics.cost)} />
        <BigMetric label="Payout" value={number(data.metrics.payout)} />
        <BigMetric label="NMR" value={number(data.metrics.nmr, 1)} />
        <BigMetric label="ROAS" value={pct(data.metrics.roas_pct)} />
        <BigMetric label="LP CTR" value={pct(data.metrics.lp_ctr_pct)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <MiniMetric
          leftValue={number(data.metrics.clicks)}
          leftLabel="Clicks"
          rightValue={money(data.metrics.epv, 1)}
          rightLabel="EPV"
        />
        <MiniMetric
          leftValue={number(data.metrics.clickouts)}
          leftLabel="Clickouts"
          rightValue={money(data.metrics.cpco, 1)}
          rightLabel="CPCO"
        />
        <MiniMetric
          leftValue={number(data.metrics.visits)}
          leftLabel="Visits"
          rightValue={money(data.metrics.cpv, 1)}
          rightLabel="CPV"
        />
        <MiniMetric
          leftValue={number(data.metrics.add_to_carts)}
          leftLabel="Add to Cart"
          rightValue={money(data.metrics.cpatc, 1)}
          rightLabel="Cost"
        />
        <MiniMetric
          leftValue={number(data.metrics.net_purchases)}
          leftLabel="Purchases"
          rightValue={money(data.metrics.cpa, 1)}
          rightLabel="CPA"
        />
      </div>
    </div>
  );
}
