# 0009 Bills, review and reports

**Context.** Phase 4 files bills; Phase 5 lets people trust and use them: check what the reader was unsure about, keep track of what is paid, add bills that never came by email, and see where the money goes.

**Decisions.**
- **Checking.** A bill the reader flagged (`needs_review`: no amount, low confidence, a scan) shows on Overview and in Bills ("Needs a check"). Anyone with `bills.edit` (members and above) can correct biller, amount, month, bill and due date and note, and tick "I have checked this bill"
  (default on for flagged bills). That clears the flag and records who and when (`reviewed_by`, `reviewed_at`). "Mark checked" does the same without editing. A person's change is never silently overwritten: runs never touch an existing bill (the same email is skipped).
- **By hand.** A bill with no email behind it is a normal bill row with `method = manual`, no source and no file, a unique `manual:<uuid>` key and no review flag. Amounts are typed as plain decimals (`1,234.50`, `₹1234.5`), parsed with `Money.parse`
  (more than two decimals, zero, negatives and absurd sizes are refused with a clear message). The month cannot be one that has not started.
- **Paid.** `paid_at` is a simple mark (who paid how is out of scope). It exists because "overdue" is meaningless without it: Reports list unpaid bills past their due date and those due in the next 7 days.
- **Delete is soft.** `deleted_at/by` hides a bill from lists, reports and the CSV, but the row keeps its message key, so the next run does **not** file that email again; "Deleted" shows it with a Restore button. A deleted bill cannot be edited or marked paid until restored.
- **Reports** (any member): one chosen month (default: newest with bills; this month always selectable) with its total, bill count, unpaid total and change on the month before; a 12-month column chart; a per-biller table with the change against last month; overdue and due-soon lists across *all* unpaid bills;
  and up to five plain-language insights (needs a check, overdue, due soon, the month against the last, the biggest riser, missing amounts). Totals count bills with an amount; the number without one is shown so a low total is never a surprise. Billers are grouped ignoring case and spacing.
  All maths is pure domain code (`bill-reports.ts`, bigint, percent rounded half away from zero); months and "today" use India time (UTC+5:30).
- **The chart** follows the dataviz rules: one measure on one scale, no dual axis, no legend (one series; the heading names it), thin columns (max 24px, 4px rounded tips, square on the baseline, 2px gap), hairline grid, at most five axis ticks starting at zero, the chosen month in the accent colour *and* labelled with its value so colour is never the only cue,
  the rest in the muted ink. Every column is a link with an `aria-label`, a tooltip on hover and keyboard focus, and a table of every number under "Show as a table". The accent and muted tokens pass the 3:1 graphical-contrast check on the paper colour in both themes (the categorical validator does not apply to a single series).
- **CSV export** of exactly what the Bills page shows (same filters), for any signed-in member: UTF-8 with a byte-order mark so Excel reads `₹` and accents, plain-number amounts, `Cache-Control: private, no-store`. Text beginning with `=`, `+`, `-`, `@`, tab or CR gets a leading apostrophe so it cannot run as a spreadsheet formula.
- **Search** matches biller or source name, case-insensitively, with `%` and `_` treated as ordinary characters.

**Consequences.** Sending summaries (Phase 6) will read the same bills and reports. Currency stays INR; a bill in another currency would be entered by hand in rupees for now.
