# Glossary — Mike (Australia)

## Platform
| Term | Meaning |
|------|---------|
| Mike | The platform — Australian fork of Mike OSS |
| Mike OSS | Open-source legal AI assistant base |
| mikeoss.com | Production website |
| pdombkins/mikeOSS_Australia | GitHub repo |

## Legal Research
| Term | Meaning |
|------|---------|
| Jade / jade.io | Australian case-law platform (BarNet) — sole AU source: citation validation + judgment fetch. Requires BarNet's written permission for automated access |
| AustLII | Australasian Legal Information Institute — **REMOVED** from this project (bot-blocked; AUP prohibits automated/AI use). Historical only |
| auslaw-mcp | Third-party MCP wrapper for AustLII — NOT used |
| AGLC4 | Australian Guide to Legal Citation, 4th edition |
| MNC | Medium Neutral Citation — e.g. [2024] HCA 5 |
| Open Australian Legal Corpus | Isaacus/Butler CC BY 4.0 corpus — planned open replacement for legislation + case law (see australian-legal-sources-map.md) |

## Court Codes (neutral citations)
| Code | Court |
|------|-------|
| HCA | High Court of Australia |
| FCAFC | Full Federal Court of Australia |
| FCA | Federal Court of Australia |
| FedCFamC1F | Federal Circuit and Family Court (Division 1) |
| FedCFamC2F | Federal Circuit and Family Court (Division 2) |
| NSWCA | NSW Court of Appeal |
| NSWSC | NSW Supreme Court |
| VSCA | Victorian Court of Appeal |
| VSC | Victorian Supreme Court |
| QCA | Queensland Court of Appeal |
| QSC | Queensland Supreme Court |
| WASCA | WA Court of Appeal |
| WASC | WA Supreme Court |
| SASC | SA Supreme Court |
| NTSC | NT Supreme Court |
| ACTSC | ACT Supreme Court |
| NZHC | NZ High Court |
| NZCA | NZ Court of Appeal |
| NZSC | NZ Supreme Court |

## Tech Stack
| Term | Meaning |
|------|---------|
| R2 | Cloudflare R2 — S3-compatible object storage |
| SSR | Server-Side Rendering (Next.js) |
| RLS | Row Level Security (Supabase Postgres) |
| Turbopack | Next.js 16 bundler (used in dev) |
| tsx watch | TypeScript execution for backend dev server |

## Cost Tracking
| Term | Meaning |
|------|---------|
| query_costs | Supabase table — stores token usage and AUD cost per LLM call |
| StreamChatResult | Backend type: fullText + inputTokens + outputTokens + model |
| cost badge | Small AUD cost label rendered below each assistant response |
| cost event | SSE event type emitted before [DONE]: { type:"cost", model, inputTokens, outputTokens, costUsd, costAud } |
| MODEL_PRICES | Pricing table in backend/src/lib/pricing.ts — retail rates, update for enterprise plans |

## Models
| Model string | Provider | Notes |
|---|---|---|
| claude-fable-5 | Anthropic | $10/$50 per MTok in/out |
| claude-opus-4-8 | Anthropic | $5/$25 |
| claude-sonnet-4-6 | Anthropic | $3/$15 |
| claude-haiku-4-5 | Anthropic | $1/$5 |
| gemini-3.5-flash | Google | $1.50/$9.00 |
| gemini-3.1-pro-preview | Google | $2/$12 |
