/**
 * C018 — Curated official-source feed list. RSS/Atom feeds published by
 * governments and regulators for exactly this purpose — no AustLII, no
 * scraping of restricted sources. URLs are operator-verifiable in one place.
 */

export type RegSource = {
  id: string;
  label: string;
  jurisdiction: string;
  url: string; // RSS/Atom feed URL
};

export const REG_SOURCES: RegSource[] = [
  {
    id: "frl_new_acts",
    label: "Federal Register of Legislation — latest Acts",
    jurisdiction: "Cth",
    url: "https://www.legislation.gov.au/WhatsNew/rss",
  },
  {
    id: "asic_media",
    label: "ASIC media releases",
    jurisdiction: "Cth",
    url: "https://asic.gov.au/rss/asic-media-releases.xml",
  },
  {
    id: "accc_media",
    label: "ACCC media releases",
    jurisdiction: "Cth",
    url: "https://www.accc.gov.au/rss/media_releases.xml",
  },
  {
    id: "oaic_news",
    label: "OAIC news",
    jurisdiction: "Cth",
    url: "https://www.oaic.gov.au/rss/news",
  },
  {
    id: "apra_news",
    label: "APRA news",
    jurisdiction: "Cth",
    url: "https://www.apra.gov.au/rss.xml",
  },
  {
    id: "fwo_media",
    label: "Fair Work Ombudsman media releases",
    jurisdiction: "Cth",
    url: "https://www.fairwork.gov.au/rss/media-releases",
  },
  {
    id: "nz_legislation",
    label: "New Zealand Legislation — latest",
    jurisdiction: "NZ",
    url: "https://www.legislation.govt.nz/subscribe/rss.aspx",
  },
];

export function getRegSource(id: string): RegSource | undefined {
  return REG_SOURCES.find((s) => s.id === id);
}
