-- Migration date: 2026-07-21
-- Kimi K3 (Moonshot AI) provider — user-supplied API keys for the hosted
-- fallback endpoint. Self-hosted endpoints (KIMI_BASE_URL) need no key.

ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_provider_check;

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_provider_check
  CHECK (provider IN ('claude', 'gemini', 'openai', 'openrouter', 'courtlistener', 'moonshot'));
