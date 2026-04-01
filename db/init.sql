-- WL Marketing Agent - Database Schema
-- Conversions table with extracted/derived fields from PPC tracking data

CREATE TABLE IF NOT EXISTS conversions (
  id                              SERIAL PRIMARY KEY,

  -- Revenue
  value                           NUMERIC(10,2),
  affiliate_value                 NUMERIC(10,2),

  -- Timing
  conversion_at                   TIMESTAMPTZ,
  entered_at                      TIMESTAMPTZ,

  -- Visit tracking
  visit_id                        TEXT,
  edgetrackerid                   BIGINT,
  gclid                           TEXT,
  msclkid                         TEXT,
  gbraid                          TEXT,
  wbraid                          TEXT,
  fbclid                          TEXT,
  analytics_id                    TEXT,
  fbc                             TEXT,
  fbp                             TEXT,
  seperia_id_rel                  TEXT,

  -- Campaign structure
  campaign_id                     BIGINT,
  adgroup_id                      BIGINT,
  target_id                       TEXT,
  creative                        BIGINT,
  placement                       TEXT,
  extension_id                    TEXT,
  adtype                          TEXT,

  -- Traffic source
  platform_id                     TEXT,   -- 'bing', 'google', 'organic'
  network                         TEXT,   -- 'o'=bing_search, 'g'=google_search, 's'=syndication, 'a'=app
  device                          TEXT,   -- 'c'=computer, 'm'=mobile, 't'=tablet
  device_model                    TEXT,
  carrier                         TEXT,
  match_type                      TEXT,   -- 'e'=exact, 'p'=phrase, 'b'=broad

  -- Geographic
  loc_physical_ms                 BIGINT,
  user_country                    TEXT,
  user_ip                         TEXT,

  -- Conversion / funnel
  conversion_type                 TEXT,
  funnel_step                     TEXT,   -- 'Quiz Start', 'Quiz Complete', 'Add to Cart', 'Purchase'
  affiliate                       TEXT,   -- Medvi, Ro, SkinnyRX, Sprout, Eden, Hers, Remedy

  -- Landing page
  landing_page                    TEXT,
  landing_page_path               TEXT,
  lpurl                           TEXT,
  lpurl_2                         TEXT,
  lpurl_3                         TEXT,
  dti                             TEXT,   -- landing page variant (A/B test id)
  dbi                             TEXT,

  -- Test
  test_id                         TEXT,
  test_variant                    TEXT,
  edgetail                        TEXT,

  -- UTM / extracted from URL
  keyword                         TEXT,
  utm_campaign                    TEXT,
  utm_source                      TEXT,
  utm_medium                      TEXT,
  utm_term                        TEXT,
  utm_content                     TEXT,

  -- Site
  site_id                         TEXT,
  site_name                       TEXT,
  user_agent                      TEXT
);

-- Indexes for common query patterns
CREATE INDEX idx_conversions_conversion_at   ON conversions (conversion_at);
CREATE INDEX idx_conversions_platform_id     ON conversions (platform_id);
CREATE INDEX idx_conversions_funnel_step     ON conversions (funnel_step);
CREATE INDEX idx_conversions_affiliate       ON conversions (affiliate);
CREATE INDEX idx_conversions_campaign_id     ON conversions (campaign_id);
CREATE INDEX idx_conversions_keyword         ON conversions (keyword);
CREATE INDEX idx_conversions_device          ON conversions (device);
CREATE INDEX idx_conversions_match_type      ON conversions (match_type);
CREATE INDEX idx_conversions_utm_campaign    ON conversions (utm_campaign);
CREATE INDEX idx_conversions_value           ON conversions (value);
CREATE INDEX idx_conversions_dti             ON conversions (dti);
