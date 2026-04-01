export default function SchemaPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Data Schema & Dictionary</h1>
        <p className="text-gray-400 text-sm mt-1">
          Everything we know about the data — fields, meanings, connections, and optimization signals.
        </p>
      </div>

      {/* Overview */}
      <Section title="Dataset Overview">
        <p className="text-gray-300 text-sm leading-relaxed">
          This dataset contains <strong className="text-white">15,435 conversion events</strong> collected from{" "}
          <strong className="text-white">September 2025 to March 2026</strong> (~7 months) across Bing Ads and Google Ads
          campaigns promoting a Weight Loss comparison site (<em>top5weightchoices.com</em>). Each row represents a single
          user interaction tracked through a proprietary affiliate/tracking system. Events span the full conversion funnel from
          first click (Quiz Start) to paid subscription (Purchase).
        </p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ["15,435", "Total Events"],
            ["$326,040", "Total Revenue"],
            ["844", "Purchases"],
            ["46", "Campaigns"],
            ["186", "Ad Groups"],
            ["~100", "Unique Keywords"],
            ["2 Platforms", "Bing + Google"],
            ["7 Affiliates", "Medvi, Ro, SkinnyRX..."],
          ].map(([v, l]) => (
            <div key={l} className="bg-gray-800 rounded-lg p-3">
              <div className="text-white font-bold">{v}</div>
              <div className="text-gray-400 text-xs">{l}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Funnel */}
      <Section title="Conversion Funnel">
        <p className="text-gray-400 text-sm mb-4">
          The <code className="text-indigo-400">funnel_step</code> field tracks where the user is in the purchase journey.
          All events originate from ad clicks and flow through this funnel:
        </p>
        <div className="flex flex-col gap-2">
          {[
            { step: "Quiz Start", color: "bg-indigo-600", desc: "User clicks ad → lands on comparison page → starts quiz. This is the entry-point event. ~7,183 events." },
            { step: "Quiz Complete", color: "bg-purple-600", desc: "User finishes the quiz. Signals strong intent. ~3,097 events (43% of Quiz Starts)." },
            { step: "Add to Cart", color: "bg-yellow-600", desc: "User adds a product/plan to cart on an affiliate site (mainly Ro). ~493 events." },
            { step: "Lead", color: "bg-blue-600", desc: "User submits lead form (Ro affiliate). ~679 events." },
            { step: "Purchase", color: "bg-emerald-600", desc: "User completes a paid subscription. The ultimate goal. ~844 events, $326k revenue." },
          ].map(({ step, color, desc }) => (
            <div key={step} className="flex items-start gap-3">
              <span className={`mt-1 shrink-0 w-3 h-3 rounded-full ${color}`} />
              <div>
                <span className="text-white font-medium text-sm">{step}</span>
                <span className="text-gray-400 text-sm"> — {desc}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Fields */}
      <Section title="Field Reference">
        <FieldTable fields={FIELDS} />
      </Section>

      {/* Affiliates */}
      <Section title="Affiliates">
        <p className="text-gray-400 text-sm mb-4">
          The <code className="text-indigo-400">affiliate</code> field is extracted from the <code className="text-indigo-400">conversion_type</code> string.
          Different affiliates have different payout structures and conversion rates.
        </p>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800">
            <tr className="text-gray-400">
              <th className="text-left py-2 pr-4 font-medium">Affiliate</th>
              <th className="text-left py-2 pr-4 font-medium">Events</th>
              <th className="text-left py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Medvi", "~11,900", "Main affiliate. Has Quiz Start, Quiz Complete, Purchase events."],
              ["Ro", "~1,172", "Has Lead + Add to Cart conversions."],
              ["SkinnyRX", "~905", "Quiz Start, Quiz Complete, Purchase."],
              ["Sprout", "~1,047", "Quiz Start, Quiz Complete, Purchase."],
              ["Eden", "~13", "Purchase only, very small volume."],
              ["Hers", "~12", "Add to Cart only."],
              ["Remedy", "~5", "Purchase only."],
            ].map(([a, e, n]) => (
              <tr key={a} className="border-b border-gray-800/50">
                <td className="py-2 pr-4 text-white font-medium">{a}</td>
                <td className="py-2 pr-4 text-gray-400">{e}</td>
                <td className="py-2 text-gray-500 text-xs">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Campaign Naming */}
      <Section title="Campaign Naming Convention">
        <p className="text-gray-400 text-sm mb-3">
          UTM campaign names follow a structured pattern that encodes targeting strategy:
        </p>
        <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-indigo-300 mb-4">
          Search-generics-[tirzepatide]-en-dt-us-MMA
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["Search / PMAX", "Ad type: Search = keyword-targeted, PMAX = Performance Max (Google)"],
            ["generics / brands / broads", "Keyword category: generics (drug names), brands (affiliate brands), broads (general WL terms)"],
            ["[keyword]", "Primary targeted keyword group, e.g. [tirzepatide], [wegovy], [glp1]"],
            ["en", "Language: English"],
            ["dt / mob / all", "Device: dt = desktop, mob = mobile, all = all devices"],
            ["us", "Country: United States"],
            ["MMA", "Campaign variant suffix (often indicates bidding strategy or test group)"],
          ].map(([k, v]) => (
            <div key={k} className="bg-gray-800 rounded-lg p-3">
              <div className="text-white font-medium text-xs mb-1">{k}</div>
              <div className="text-gray-400 text-xs">{v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* DTI */}
      <Section title="Landing Page Variants (DTI)">
        <p className="text-gray-400 text-sm mb-3">
          The <code className="text-indigo-400">dti</code> field is a short code identifying which landing page variant
          was shown to the user. This is used for A/B testing different page layouts, headlines, or product orderings.
          Top variants: <span className="text-white">r4</span> (3,640), <span className="text-white">j4</span> (1,486),{" "}
          <span className="text-white">i2</span> (1,386), <span className="text-white">t3</span> (864),{" "}
          <span className="text-white">u8</span> (700).
        </p>
        <p className="text-gray-400 text-sm">
          Analyzing purchase rates by DTI variant reveals which landing page is most effective at converting clicks into revenue.
        </p>
      </Section>

      {/* Optimization */}
      <Section title="Optimization Framework — Max Conversions / Min Price">
        <p className="text-gray-400 text-sm mb-4">
          The primary goal is <strong className="text-white">maximum purchases at minimum cost</strong>. Key levers to analyze:
        </p>
        <div className="flex flex-col gap-3">
          {[
            { title: "Keyword efficiency", desc: "Which keywords deliver the highest purchase CVR? Cut/reduce spend on high-volume, zero-purchase keywords." },
            { title: "Campaign performance", desc: "Which campaigns have the best purchase rate and lowest cost-per-acquisition? Shift budget there." },
            { title: "Device & platform split", desc: "Desktop vs Mobile purchase rates differ significantly. Adjust device bid modifiers accordingly." },
            { title: "Match type optimization", desc: "Exact (e) vs Phrase (p) vs Broad (b) — each has different cost and conversion profiles." },
            { title: "Landing page variant (DTI)", desc: "Some DTI variants convert better. Pause underperformers, scale winners." },
            { title: "Affiliate mix", desc: "Different affiliates have different payout rates and conversion flows. Understand which affiliates drive the most revenue per click." },
            { title: "Funnel drop-off", desc: "Quiz completion rate is 43%. Improving this directly increases purchases without increasing ad spend." },
            { title: "Time patterns", desc: "Daily/weekly trends can reveal the best times to increase bids or budgets." },
          ].map(({ title, desc }) => (
            <div key={title} className="flex gap-3 bg-gray-800 rounded-lg p-3">
              <span className="text-emerald-400 mt-0.5">▸</span>
              <div>
                <span className="text-white font-medium text-sm">{title}: </span>
                <span className="text-gray-400 text-sm">{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-gray-800">{title}</h2>
      {children}
    </div>
  );
}

function FieldTable({ fields }: { fields: typeof FIELDS }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="border-b border-gray-800">
          <tr className="text-gray-400">
            <th className="text-left py-2 pr-4 font-medium w-40">Field</th>
            <th className="text-left py-2 pr-4 font-medium w-24">Type</th>
            <th className="text-left py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name} className="border-b border-gray-800/40 hover:bg-gray-800/20">
              <td className="py-1.5 pr-4 font-mono text-indigo-400">{f.name}</td>
              <td className="py-1.5 pr-4 text-gray-500">{f.type}</td>
              <td className="py-1.5 text-gray-300">{f.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FIELDS = [
  { name: "id", type: "integer", desc: "Auto-increment primary key." },
  { name: "value", type: "numeric", desc: "Revenue value of this conversion event in USD. 0 for non-purchase events." },
  { name: "affiliate_value", type: "numeric", desc: "Affiliate payout value (mirrors value in this dataset)." },
  { name: "conversion_at", type: "timestamptz", desc: "When the conversion event occurred (UTC). Derived from Unix timestamp in source." },
  { name: "entered_at", type: "timestamptz", desc: "When the user first entered the funnel (click timestamp, UTC)." },
  { name: "visit_id", type: "text", desc: "Unique identifier for the user visit/session. Format: udb-{affiliate_id}-{hash}." },
  { name: "platform_id", type: "text", desc: "Ad platform: 'bing', 'google', or 'organic'." },
  { name: "network", type: "text", desc: "Ad network code: 'o' = Bing search, 'g' = Google search, 's' = Syndication/display, 'a' = App." },
  { name: "device", type: "text", desc: "Device type: 'c' = Computer/Desktop, 'm' = Mobile, 't' = Tablet." },
  { name: "match_type", type: "text", desc: "Keyword match type: 'e' = Exact, 'p' = Phrase, 'b' = Broad." },
  { name: "campaign_id", type: "bigint", desc: "Numeric ID of the campaign in the ad platform." },
  { name: "adgroup_id", type: "bigint", desc: "Numeric ID of the ad group within the campaign." },
  { name: "target_id", type: "text", desc: "Keyword target ID with location modifier. Format: kwd-{id}:loc-{location_id}." },
  { name: "creative", type: "bigint", desc: "Ad creative/ad copy ID." },
  { name: "loc_physical_ms", type: "bigint", desc: "Microsoft location ID of the user's physical location." },
  { name: "conversion_type", type: "text", desc: "Raw conversion type string from tracking system. Encodes affiliate + funnel step. E.g. 'Purchase - Medvi - WL'." },
  { name: "funnel_step", type: "text", desc: "Normalized funnel step: 'Quiz Start', 'Quiz Complete', 'Add to Cart', 'Lead', 'Purchase', 'Other'." },
  { name: "affiliate", type: "text", desc: "Extracted affiliate name: Medvi, Ro, SkinnyRX, Sprout, Eden, Hers, or Remedy." },
  { name: "keyword", type: "text", desc: "Search keyword that triggered the ad (extracted from landing page URL ap_keyword param)." },
  { name: "utm_campaign", type: "text", desc: "UTM campaign name. Encodes ad type, keyword group, device, and language. See Campaign Naming section." },
  { name: "utm_source", type: "text", desc: "UTM source: 'bing' or 'google'." },
  { name: "utm_medium", type: "text", desc: "UTM medium: 'cpc'." },
  { name: "utm_term", type: "text", desc: "UTM term — usually the keyword, URL-encoded." },
  { name: "utm_content", type: "text", desc: "UTM content — usually the ad group name." },
  { name: "dti", type: "text", desc: "Landing page variant code (A/B test ID). E.g. 'r4', 'j4', 'i2'. Used to identify which page layout was shown." },
  { name: "dbi", type: "text", desc: "Dynamic bid insertion parameter. E.g. '591,4,R' — used by automated bidding systems." },
  { name: "landing_page", type: "text", desc: "Full URL of the landing page the user visited (including all tracking params)." },
  { name: "landing_page_path", type: "text", desc: "URL path only (no query string). E.g. '/compare/top-5-weight-loss-medications/'." },
  { name: "lpurl", type: "text", desc: "Landing page URL stored in the ad platform (may differ slightly from actual landing_page)." },
  { name: "gclid", type: "text", desc: "Google Click ID — unique identifier for clicks from Google Ads." },
  { name: "msclkid", type: "text", desc: "Microsoft Click ID — unique identifier for clicks from Bing Ads." },
  { name: "gbraid / wbraid", type: "text", desc: "Google conversion linking parameters for iOS privacy-preserving measurement." },
  { name: "test_id / test_variant", type: "text", desc: "A/B test identifiers from the landing page testing system." },
  { name: "user_country", type: "text", desc: "Country of the user. Nearly all events are 'United States'." },
  { name: "user_ip", type: "text", desc: "User IP address (often null for privacy reasons)." },
  { name: "user_agent", type: "text", desc: "Browser user agent string. Useful for detailed device/OS analysis." },
  { name: "site_id", type: "text", desc: "Site identifier UUID. All events point to the same site (Top 5 Weight Choices)." },
  { name: "site_name", type: "text", desc: "Human-readable site name: 'Top 5 Weight Choices'." },
  { name: "seperia_id_rel", type: "text", desc: "Internal relational ID used by the Seperia tracking platform (usually null)." },
  { name: "analytics_id", type: "text", desc: "Analytics session ID (usually null)." },
  { name: "edgetrackerid", type: "bigint", desc: "Numeric edge tracker ID assigned by the click tracking system." },
];
