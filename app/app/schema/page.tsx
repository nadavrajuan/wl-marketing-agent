const sections = {
  datasets: [
    {
      title: "weightagent.WeightAgent",
      body: "Operational marketing truth: visits, conversions, legacy Google campaign facts, and Bing ad performance. This is still the source for purchase truth, partner outcomes, landing pages, and Bing attribution.",
      bullets: [
        "`visits` carries the session spine: platform, campaign, ad group, creative/ad ID, click IDs, landing page, keyword params, device, and timestamp.",
        "`conversions` carries purchase truth and partner truth. Purchase is the only primary success event. Add to cart is modeled as a weighted proxy, not a funnel step we optimize toward directly.",
        "`google_ad_data` and `bing_ad_data` remain useful for campaign/ad coverage and Bing media facts.",
      ],
    },
    {
      title: "weightagent.GoogleAds",
      body: "Native Google Ads transfer dataset. This is the major upgrade that unlocks exact Google keyword spend, click-level joins, search-query diagnostics, and live RSA copy payloads.",
      bullets: [
        "`ads_ClickStats_*` gives click-level GCLIDs, keyword text, ad references, device, and date.",
        "`ads_KeywordStats_*` gives exact keyword-day spend, clicks, and impressions.",
        "`ads_SearchQueryStats_*` gives native search terms, clicks, spend, and match details.",
        "`ads_Ad_*` gives RSA headlines/descriptions, ad strength, approval status, and final URLs.",
      ],
    },
  ],
  joins: [
    "Google exact path: `ads_ClickStats.click_view_gclid -> visits.gclid -> conversions.visit_id`.",
    "Bing path is still mostly inferred from campaign / ad group / ad / date / device because we do not yet have the same native click export there.",
    "Campaign, keyword, landing-page, and ad-copy views should always show confidence so we know what is exact versus inferred.",
  ],
  truth: [
    "Primary KPI: net purchases.",
    "Purchase value default: `$390` per purchase.",
    "Add to cart proxy: `25%` of purchase value by default. It is tracked separately and never replaces purchase truth.",
    "Reversals subtract from purchase value and must be surfaced explicitly.",
  ],
  products: [
    "Action Board: blended optimization layer. Exact Google keyword economics + inferred Bing keyword economics + partner and landing-page actions.",
    "Copy Lab: native Google RSA copy diagnostics plus theme-level Bing inference.",
    "Keywords: purchase-first keyword economics with spend, profit, ROI, and landing-page context.",
    "Search Terms: Google-only search query diagnostics using native SearchQueryStats with click-share purchase estimation.",
    "Campaigns and Segments: purchase-first summaries, not quiz-first summaries.",
  ],
  gaps: [
    "Google is now much richer than before, but the exact window depends on what the transfer contains.",
    "Bing still needs a richer export if we want native copy/assets, search terms, and click-level attribution there too.",
    "Search query purchase attribution is still estimated because Google does not give us a clean per-click search-term-to-conversion ledger in the warehouse.",
  ],
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-3 pb-2 border-b border-gray-800">{title}</h2>
      {children}
    </section>
  );
}

function Card({
  title,
  body,
  bullets,
}: {
  title: string;
  body: string;
  bullets: string[];
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="text-white font-medium mb-2">{title}</div>
      <p className="text-sm text-gray-300 leading-relaxed mb-3">{body}</p>
      <div className="space-y-2">
        {bullets.map((bullet) => (
          <div key={bullet} className="text-sm text-gray-400 flex gap-2">
            <span className="text-indigo-400">▸</span>
            <span>{bullet}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item} className="text-sm text-gray-300 flex gap-2">
          <span className="text-emerald-400">▸</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export default function SchemaPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Warehouse Schema & Measurement Rules</h1>
        <p className="text-gray-400 text-sm mt-1">
          The schema now reflects the real warehouse v2: internal purchase truth plus native Google Ads transfer data.
        </p>
      </div>

      <Section title="The Current Model">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          {[
            ["2 Datasets", "WeightAgent + GoogleAds"],
            ["Primary KPI", "Net purchases"],
            ["Exact Google", "GCLID + KeywordStats + RSA"],
            ["Bing Status", "Still partly inferred"],
          ].map(([value, label]) => (
            <div key={label} className="bg-gray-800 rounded-lg p-4">
              <div className="text-white text-lg font-semibold">{value}</div>
              <div className="text-gray-400 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Datasets">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sections.datasets.map((section) => (
            <Card key={section.title} {...section} />
          ))}
        </div>
      </Section>

      <Section title="Canonical Join Graph">
        <div className="bg-gray-800 rounded-xl p-4 mb-4">
          <pre className="text-xs text-indigo-300 whitespace-pre-wrap">{`Google Click -> GCLID -> Visit -> Conversion
ads_ClickStats_* -> visits.gclid -> conversions.visit_id

Keyword Spend -> Keyword / Campaign / Device
ads_KeywordStats_* -> keyword economics

Search Query -> Query diagnostics
ads_SearchQueryStats_* -> search term insights

RSA Metadata -> Ad copy diagnostics
ads_Ad_* + ads_AdBasicStats_* -> headlines / descriptions / strength / approval`}</pre>
        </div>
        <BulletList items={sections.joins} />
      </Section>

      <Section title="Measurement Truth Rules">
        <BulletList items={sections.truth} />
      </Section>

      <Section title="What The Product Should Now Show">
        <BulletList items={sections.products} />
      </Section>

      <Section title="Current Caveats">
        <BulletList items={sections.gaps} />
      </Section>
    </div>
  );
}
