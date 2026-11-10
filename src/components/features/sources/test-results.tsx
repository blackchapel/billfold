import type { TesterDto } from "@/types/source";

/** What the tester found. Passwords are never shown, only whether one could be read. */
export function TestResults({ result, passwordInSubject }: { result: TesterDto; passwordInSubject: boolean }) {
  const { matches, scanned, windowDays } = result;
  return (
    <section aria-label="Test results" className="mt-6 rounded-md border border-line p-4">
      <h3 className="font-serif text-xl">
        {matches.length === 0 ? "No emails matched" : `${matches.length} matching email${matches.length === 1 ? "" : "s"}`}
      </h3>
      <p className="mt-1 text-xs text-muted">
        Looked at {scanned} candidate email{scanned === 1 ? "" : "s"} from the last {windowDays} days. Nothing was downloaded or saved.
      </p>
      {matches.length === 0 && scanned > 0 && <p className="mt-3 text-sm">Some emails came from your senders but did not pass the other rules. Loosen the subject or attachment rules.</p>}
      {matches.length === 0 && scanned === 0 && <p className="mt-3 text-sm">No emails from those senders in that time. Check the sender address, or the mailbox you chose.</p>}
      {matches.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
          {matches.map((m, i) => (
            <li key={`${m.date}-${i}`} className="py-2">
              <p className="font-medium">{m.subject || "(no subject)"}</p>
              <p className="text-xs text-muted">{m.from} · {new Date(m.date).toLocaleDateString("en-IN")} · {m.attachments.length === 0 ? "no attachment" : m.attachments.join(", ")}</p>
              {passwordInSubject && m.passwordFound !== null && (
                <p className={`text-xs ${m.passwordFound ? "text-muted" : "text-danger"}`}>{m.passwordFound ? "Password found in the subject." : "No password found in this subject."}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
