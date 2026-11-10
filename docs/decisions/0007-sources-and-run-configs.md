# 0007 Sources and run configurations

**Context.** A run (Phase 4) needs two things configured first: how to recognise a bill email, and where the results go. Billfold ships no built-in templates (non-goal), so people define both.

**Decisions.**
- A **source** = mailbox (a Gmail or IMAP connection) + sender rules (addresses or whole domains, subdomains included) + optional subject text + optional attachment name text + "must have an attachment" + how the PDF is locked
  (`none`, a saved `static` password, the Jio-style `subject_brackets`, or a custom `subject_pattern` regex with one capture group).
- `matchesMessage` in the domain layer is the single definition of "this email belongs to this source". The tester uses it now and the pipeline will use it in Phase 4, so what the tester shows is what a run will pick.
  Gmail/IMAP queries only narrow the search; `LiveMailSearch` then trims to the exact time window because IMAP filters by day.
- The **tester** is a dry run on the real mailbox: last 90 days (up to 365), at most 100 candidates scanned and 20 shown, headers and attachment names only. It works from the unsaved form, so rules can be tried before saving.
- Subject passwords are never stored or displayed: `redactSubjectPassword` masks the captured group, and the tester only says whether one was found.
- A **run configuration** = sources + a mandatory Google Drive connection + a Drive folder name + the default month (`previous_month` or `current_month`). Month boundaries are drawn in IST (UTC+5:30, fixed offset, `ORG_UTC_OFFSET_MINUTES`).
  Creating the Drive folder and choosing another month at run time belong to Phase 4.
- Connections that sources or run configurations use cannot be removed: the foreign keys are `RESTRICT`, and `RemoveConnection` checks first and names the dependants. Deleting a source drops it from run configurations (cascade).
- Names are unique per org, case-insensitively. Only `sources.manage` / `run_configs.manage` change anything; every member can read the rules (never the password).
- IMAP searches the INBOX only. Mail filed into other folders is not found; use a filter or label on the mail provider's side to deliver bills to the inbox.

**Consequences.** Phase 4 adds runs on top: it reads `SourceRecord`, `RunConfigRecord`, `matchesMessage`, `extractSubjectPassword` and `resolvePeriod` without changing them.
