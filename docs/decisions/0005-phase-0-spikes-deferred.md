# 0005 Phase 0 platform spikes deferred to the phase that needs them
**Context.** Phase 0 asked for spikes on PDF decryption, email-to-PDF, IMAP/SMTP from Vercel, and a check of current
Vercel, Supabase, Gmail and Gemini limits. Phase 1 (foundation) was requested directly and needs none of them.
**Decision.** Run each spike at the start of the phase that depends on it (IMAP/SMTP in Phase 2, PDF decryption and
email-to-PDF in Phase 4, Gemini terms before Phase 4) and record the result as an ADR then.
**Consequences.** Risk stays visible: if IMAP/SMTP or Chromium do not fit Vercel, we find out before building on them.
