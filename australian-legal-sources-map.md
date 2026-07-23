# Australian Primary Law — Official Source Map

**Purpose:** Replace AustLII/Jade as data sources for Mike with official, first-party sources that permit reuse. Target: full coverage of all Acts and Regulations (Commonwealth + 8 states/territories) and the widest feasible case-law coverage.

**Date:** 5 July 2026 · Compiled for the Mike (Australia) teaching build.

> **Key legal caveat.** "Official source" is not the same as "openly licensed." Australian statutes, regulations and judgments are subject to **Crown copyright** (Copyright Act 1968 (Cth) ss 176–178) unless a jurisdiction has waived or licensed it. Some jurisdictions now publish under Creative Commons (open); others still assert "all rights reserved / personal use only." For anything not openly licensed, the compliant options are (a) get written permission from the register/court, or (b) rely on a copyright exception (fair dealing for research or study). Access blocking/robots rules are a *separate* constraint from copyright — check both per source. This document flags licence status per source; verify the live copyright notice before ingesting, because these policies change.

---

## 1. The big head start: Open Australian Legal Corpus (OALC)

Before building any scrapers, note that most of this job is **already done, permission-cleared, and openly licensed**.

The **Open Australian Legal Corpus** (by Umar Butler / Isaacus) is the first multijurisdictional open corpus of Australian law: ~229,000 documents, ~1.4 billion tokens. The **compilation is licensed CC BY 4.0**; component documents are distributed under their own (mostly permissive) licences. Critically, the author **obtained scraping permission** from each source below, so the corpus is a lawful, attributable starting dataset — and the scraper code is open source.

- Dataset: https://huggingface.co/datasets/isaacus/open-australian-legal-corpus
- Scraper code (per-source, working): https://github.com/isaacus-dev/open-australian-legal-corpus-creator
- Licence detail: https://huggingface.co/datasets/isaacus/open-australian-legal-corpus/blob/main/LICENCE.md

**What OALC already contains (current release):**

| Source | Content | Docs |
|---|---|---|
| Federal Register of Legislation | All in-force Cth Acts + the Constitution; all in-force legislative/notifiable instruments | 32,356 |
| Federal Court of Australia | All decisions of FCA + Industrial Relations Court, Aust Competition Tribunal, Copyright Tribunal, Defence Force Discipline Appeal Tribunal, Federal Police Disciplinary Tribunal, Trade Practices Tribunal, Norfolk Island SC | 63,749 |
| High Court of Australia | All HCA decisions | 8,096 |
| NSW Caselaw | All decisions of every NSW court + tribunal (Supreme, CA, CCA, District, Local, Land & Environment, NCAT, etc.) | 117,371 |
| NSW Legislation | All in-force public/private Acts + statutory/environmental-planning instruments | 2,216 |
| Queensland Legislation | All in-force Acts + statutory instruments; bills (as introduced) | 3,306 |
| Western Australian Legislation | All in-force Acts + subsidiary legislation | 1,564 |
| South Australian Legislation | All in-force Acts + regulations/proclamations/policies | 1,350 |
| Tasmanian Legislation | All in-force Acts + statutory rules | 2,552 |
| **(Norfolk Island legislation also included)** | | |

**What OALC does NOT cover — your gap list:** Victoria (legislation + courts), ACT (legislation + courts), NT (legislation + courts), and the state courts/tribunals of QLD, WA, SA, TAS (plus federal tribunals ART and Fair Work). See §4–§5.

**Recommended approach:** ingest OALC as the base layer (attribute it under CC BY 4.0), then extend it with the missing sources below — ideally contributing your scrapers back to the OALC creator repo.

---

## 2. Legislation — official registers (all jurisdictions)

All Acts + Regulations. ✅ = already in OALC.

| Jurisdiction | Official register | Formats / bulk access | Licence status | OALC |
|---|---|---|---|---|
| **Commonwealth** | Federal Register of Legislation — legislation.gov.au | HTML/PDF/Word per item; whole-title download; ViewState-based site (scraper needed, or use OALC) | **CC BY 4.0** (open) | ✅ |
| **NSW** | legislation.nsw.gov.au | HTML/PDF; **XML export**; TERATEXT system with public API endpoints | Crown © (Parliamentary Counsel's Office); OALC has permission — verify computational-reuse terms | ✅ |
| **Queensland** | legislation.qld.gov.au | HTML (2016+)/PDF; **XML on request**; also data.qld.gov.au open-data portal | **CC BY 4.0** (open; QLD Government default) | ✅ |
| **Western Australia** | legislation.wa.gov.au | HTML/PDF/Word | Crown ©; OALC has permission — verify | ✅ |
| **South Australia** | legislation.sa.gov.au | RTF/PDF/HTML | Crown ©; OALC has permission — verify | ✅ |
| **Tasmania** | legislation.tas.gov.au (EnAct) | HTML/PDF; whole-title HTML views | Crown ©; OALC has permission — verify | ✅ |
| **Victoria** | legislation.vic.gov.au | HTML/PDF | **© State of Victoria — "personal use only"** (NOT open). Contact: ocpc@vic.gov.au | ❌ **gap** |
| **ACT** | legislation.act.gov.au | Authorised PDF + unauthorised Word | **© ACT Government, "all rights reserved"** — verify reuse terms. Contact: pco@act.gov.au | ❌ **gap** |
| **NT** | legislation.nt.gov.au | PDF/Word | Crown © (verify current copyright notice) | ❌ **gap** |

**Legislation bottom line:** with OALC you already have Cth + NSW + QLD + WA + SA + TAS. To reach **full national coverage you must add Victoria, ACT and NT**. Two of those (VIC "personal use only"; ACT "all rights reserved") are not openly licensed, so for those either seek written permission (addresses above) or rely on fair dealing for the teaching build. Commonwealth and Queensland are unambiguously open (CC BY 4.0) and safe to reuse with attribution.

---

## 3. Case law — official / first-party sources

Australia has **no single official free case-law database** (that gap is exactly what AustLII filled). Coverage must be assembled court-by-court. Most courts publish only *selected* judgments and assert Crown copyright without an open licence, and few offer bulk/API access. "As much as possible" realistically = OALC's large backfile (HCA, Federal Court family, all NSW) **plus** per-court official portals for the rest.

### Federal

| Court / tribunal | Official source | Access | Notes | OALC |
|---|---|---|---|---|
| **High Court** | eresources.hcourt.gov.au (judgments DB); hcourt.gov.au (recent) | HTML; year-based browse | Crown © | ✅ (all) |
| **Federal Court of Australia** | fedcourt.gov.au → Digital Law Library → Judgments | HTML search; mixed encodings | Crown © | ✅ (all) |
| **Federal Circuit & Family Court (FCFCOA)** | Commonwealth Courts Portal — comcourts.gov.au; fcfcoa.gov.au | Portal search | Crown ©; **not fully in OALC** — add | ⚠️ partial |
| **Administrative Review Tribunal (ART)** | art.gov.au | Decisions search | **Replaced the AAT on 14 Oct 2024**; publishes significant decisions; legacy AAT decisions transitioned | ❌ add |
| **Fair Work Commission** | fwc.gov.au → Find decisions and orders | Document search; decisions since 1 Jan 2003 | Pre-2003 only via AustLII | ❌ add |

### States & territories

| Jurisdiction | Official source(s) | Access | Notes | OALC |
|---|---|---|---|---|
| **NSW** | **NSW Caselaw** — caselaw.nsw.gov.au | Advanced search; all NSW courts + tribunals; community Python tool exists | Best official state portal; © State of NSW — verify computational terms | ✅ (all) |
| **Victoria** | Supreme Court — supremecourt.vic.gov.au; Court Services Victoria — courts.vic.gov.au (judgments); Law Library Victoria catalogue | HTML; no open API | Selected judgments; full text historically only on AustLII | ❌ **gap** |
| **Queensland** | **Supreme Court Library Qld CaseLaw** — sclqld.org.au/caselaw; queenslandjudgments.com.au; courts.qld.gov.au/decisions | Search; "official publisher of unreported judgments in QLD"; published within 24h | Strong quasi-official coverage of QLD courts + tribunals | ❌ add |
| **Western Australia** | **eCourts Portal of WA** — ecourts.justice.wa.gov.au; supremecourt.wa.gov.au; districtcourt.wa.gov.au | Portal search; District Court 1996– | Crown © | ❌ add |
| **South Australia** | Courts Administration Authority — courts.sa.gov.au (judgments) | HTML lists | Selected judgments | ❌ add |
| **Tasmania** | Supreme Court — supremecourt.tas.gov.au; magistratescourt.tas.gov.au | HTML lists | Selected judgments | ❌ add |
| **ACT** | ACT Courts — courts.act.gov.au (Supreme + Magistrates) | HTML lists | Crown © | ❌ add |
| **NT** | Supreme Court of NT — supremecourt.nt.gov.au | HTML lists | Selected judgments | ❌ add |

**Case-law bottom line:** OALC gives you the High Court, the Federal Court family, and the entire NSW court/tribunal system out of the box — the largest and most-cited slices. To broaden coverage, add the official portals for VIC, QLD (SCLQ is excellent), WA (eCourts), SA, TAS, ACT, NT, plus federal tribunals (ART, Fair Work). Expect *selected* rather than exhaustive historical coverage from official portals, and expect to request permission per court because most assert Crown copyright without an open licence.

---

## 4. Coverage gaps & concrete actions

**To achieve full legislation coverage (your hard requirement):**

1. Ingest OALC → instantly covers Cth, NSW, QLD, WA, SA, TAS.
2. Add **Victoria** (legislation.vic.gov.au) — build/borrow a scraper; seek permission from OCPC (ocpc@vic.gov.au) because it's "personal use only," or rely on fair dealing for teaching.
3. Add **ACT** (legislation.act.gov.au) — authorised PDF + Word; request reuse terms from PCO (pco@act.gov.au).
4. Add **NT** (legislation.nt.gov.au) — confirm copyright notice; request permission if reserved.

**To maximise case-law coverage:**

5. Keep OALC's HCA + Federal Court + NSW Caselaw.
6. Add per-jurisdiction official portals (table §3), prioritising SCLQ (QLD) and eCourts (WA) which have the strongest official coverage.
7. Add federal tribunals: ART (art.gov.au) and Fair Work Commission (fwc.gov.au).
8. For each court, send a short teaching/research permission request (reuse the AustLII letter template already in this repo).

---

## 5. Licensing reality check (for a law-teaching context)

- **Openly licensed (safe to reuse with attribution):** Commonwealth legislation and Queensland legislation are **CC BY 4.0**. The OALC compilation is CC BY 4.0.
- **Crown copyright, permission obtained by OALC:** NSW, WA, SA, TAS legislation — lawful to use via OALC; confirm terms if you re-scrape directly.
- **Not openly licensed — needs permission or a fair-dealing basis:** Victoria legislation ("personal use only"), ACT legislation ("all rights reserved"), NT legislation (verify), and essentially all court judgments (Crown ©, selected publication).
- **Primary-law copyright nuance:** even where a register asserts rights, the *text of the law itself* attracts thin protection and wide public-interest reproduction; a non-commercial teaching tool has a strong fair-dealing (research or study) footing. But "official + openly licensed" (Cth, QLD, OALC) is always the cleanest path — prefer it where you can.
- **Access ≠ licence:** unlike AustLII, none of these official registers publish an anti-AI/anti-automation policy of AustLII's breadth. Still, check each site's robots.txt and terms before automated collection, throttle politely, and identify your crawler.

---

## 6. Recommended build sequence

1. **Base layer:** download OALC, load as the initial corpus, wire attribution.
2. **Legislation completeness:** add VIC + ACT + NT scrapers → full national Acts/Regulations coverage. Send permission requests for VIC/ACT/NT in parallel.
3. **Case-law breadth:** add SCLQ (QLD), eCourts (WA), then SA/TAS/ACT/NT Supreme Courts, ART, and Fair Work.
4. **Citations:** derive medium neutral citations directly from judgment metadata (MNCs are facts, freely usable) rather than from any provider's value-added citation layer.
5. **Hygiene:** per-source robots/terms check, polite rate-limiting, identifying user-agent, cache to avoid re-fetching, and contribute scrapers back to the OALC creator repo.

---

### Source links
- Open Australian Legal Corpus — https://huggingface.co/datasets/isaacus/open-australian-legal-corpus
- OALC creator (scrapers) — https://github.com/isaacus-dev/open-australian-legal-corpus-creator
- Federal Register of Legislation — https://www.legislation.gov.au/
- NSW — https://legislation.nsw.gov.au/ · QLD — https://www.legislation.qld.gov.au/ · VIC — https://www.legislation.vic.gov.au/ (copyright: /copyright) · WA — https://www.legislation.wa.gov.au/ · SA — https://www.legislation.sa.gov.au/ · TAS — https://www.legislation.tas.gov.au/ · ACT — https://www.legislation.act.gov.au/ · NT — https://legislation.nt.gov.au/
- High Court — https://eresources.hcourt.gov.au/ · Federal Court — https://www.fedcourt.gov.au/digital-law-library/judgments/search · Comm Courts Portal — https://www.comcourts.gov.au/ · ART — https://www.art.gov.au/ · Fair Work — https://www.fwc.gov.au/hearings-decisions/find-decisions-and-orders
- NSW Caselaw — https://www.caselaw.nsw.gov.au/ · VIC Supreme — https://www.supremecourt.vic.gov.au/ · SCLQ CaseLaw — https://www.sclqld.org.au/caselaw · WA eCourts — https://ecourts.justice.wa.gov.au/ · SA courts — https://www.courts.sa.gov.au/ · TAS Supreme — https://www.supremecourt.tas.gov.au/ · ACT courts — https://www.courts.act.gov.au/ · NT Supreme — https://supremecourt.nt.gov.au/
