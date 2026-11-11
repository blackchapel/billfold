# 0008 Runs: collect, unlock, read, file

**Context.** Phase 4 turns the configuration from Phases 2 and 3 into filed bills. It also settles the platform checks that Phase 0 deferred: PDF decryption, email to PDF, IMAP on Vercel and Gemini's terms.

**Decisions.**
- **One item per request.** `StartRun` only *plans*: it searches each source's mailbox for the chosen month (India time) and writes one `run_items` row per matching PDF (or per email, for sources that allow the bill to be the email body). Nothing is downloaded yet. `ProcessNextItem` then files exactly one item per call; the run page calls it in a loop.
  A request stays short (Vercel limit), and one bad email can only fail its own row. Closing the page just pauses: reopening it carries on.
- **Safe to run twice.** Every item has a key (`source:message:attachment`). A bill with that key in the org means the email is already filed, so later runs mark it *skipped*. Items are claimed with `SELECT … FOR UPDATE SKIP LOCKED`, so two open tabs never file the same item. An item stuck in "processing" for 5 minutes (its request died) is handed out again.
- **PDF passwords (spike result).** `@cantoo/pdf-lib` (pure JavaScript, no binary, runs on Vercel) opens PDFs encrypted with RC4-40, RC4-128, AES-128, AES-256 (R5) and AES-256 (R6); all five were generated with a different tool (pypdf) and tested, including a wrong and a missing password. The unlocked copy is re-saved without encryption, which is what goes to Drive.
  A damaged file that "loads" with no pages is reported as unreadable. Forms, signatures and XFA content may not survive the re-save; bills are plain statements, so this is accepted.
- **Email to PDF (spike result).** A headless browser does not fit the free Vercel tier, so a bill that is the email body becomes a simple text-only PDF (`pdf-lib`, Helvetica, A4): the HTML is reduced to text, `₹` is written as `Rs.` and characters outside Latin-1 become `?`. Layout and images of the original email are not kept. If that is not enough for a biller, ask them for the PDF or forward the PDF.
- **Reading the amount.** Two readers behind one port. The built-in text reader (`parseBillText`) looks for labels such as "Total amount due" and never guesses silently: with no label it takes the largest ₹ amount and says so; with no amount or no text (a scan) the bill is filed and flagged *needs review* with a note.
  With `GEMINI_API_KEY` set, Gemini reads the unlocked PDF instead; if Gemini fails or answers badly, the text reader takes over and the note says so. Only the PDF and a short instruction are sent: never a password, subject, address or credential (tested).
  **Gemini terms:** on the free tier Google may use submitted content to improve its products. Bills are personal data, so leaving the key unset is the private choice; set it only after accepting that, or use a paid key.
- **IMAP on Vercel (spike result).** Login, search and download each use one short-lived connection inside a single request, so they fit serverless functions. Proven against a local IMAP server (byte-exact attachments) and by the owner's real mailbox on billfold-dev.
- **Drive.** With the `drive.file` scope Billfold sees only what it created, so it keeps its own folder chain `<folder>/<YYYY-MM>/<source>` (a same-named folder made by hand is left alone). Files are uploaded with the multipart API; the database keeps ids, a link and a SHA-256, never the bytes.
- **A run keeps working if its setup changes.** The Drive account and folder are copied onto the run when it starts. Deleting a source or the configuration mid-run fails only the affected items ("This source was deleted…").
  Deleting a Drive connection later is allowed once no configuration uses it: filed bills keep the account name and link.
- **Errors people can act on.** Items store short plain-language messages ("The password did not open this PDF. Check the source's PDF setting."). Provider errors can contain credentials, so they are logged only as code and message-type, never stored or shown.
- **Subjects with passwords are masked** before storing (`redactSubjectPassword`); the real subject is read again from the mailbox only when the item is processed.
- **Money** is bigint minor units in `bills.amount_minor`; the currency is the org default (INR) and anything else is flagged for review instead of being stored in a wrong currency.

**Consequences.** Review and correction of flagged bills, reports and insights are Phase 5 and read `bills`/`bill_files`; sending is Phase 6.
