import Link from "next/link";
import { ContactLine, LegalSection, LegalShell } from "@/components/features/legal/legal-shell";
import { LEGAL_UPDATED } from "@/constants/legal";
import { contactEmail } from "@/lib/contact";

export const metadata = { title: "Terms", description: "The rules for using Billfold." };

export default function Terms() {
  return (
    <LegalShell title="Terms of use" updated={LEGAL_UPDATED}>
      <p>
        These terms apply to everyone who uses this copy of Billfold. By signing in you agree to them. Billfold is a small private service run by an individual, not a company product,
        so the terms are short and plain.
      </p>

      <LegalSection title="Who may use it">
        <p>Billfold is invite-only. You may use it if the person who runs it approved your Google account, and you may stay for as long as they allow. They can remove your access at any time.</p>
      </LegalSection>

      <LegalSection title="What you are responsible for">
        <ul className="list-disc space-y-2 pl-6">
          <li>Connect only mailboxes, Drive accounts and sending accounts that you are allowed to use, and keep their passwords private.</li>
          <li>Add only people who expect to receive your summaries. Do not use Billfold to send anything other than your own bill summaries, or to send unwanted email.</li>
          <li>Do not try to reach other organisations&rsquo; data, to break or overload the service, or to use it for anything unlawful.</li>
          <li>Keep your own copies of anything important. Your original bills stay in your mailbox and your Drive.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Please check the numbers">
        <p>
          Billfold reads amounts and dates from emails and PDFs automatically, and it can be wrong, especially for scans and unusual layouts. It marks what it is unsure about for you to check,
          but you remain responsible for what you pay and for what you send to others. A summary is a convenience, not an accounting record.
        </p>
      </LegalSection>

      <LegalSection title="No promises about availability">
        <p>
          Billfold runs on free services with limits of their own, so it may be slow, unavailable or changed without notice. It is provided as it is, without any warranty. To the extent the law allows,
          the person running it is not liable for lost data, missed payments, late fees, emails that were not delivered or any other loss that comes from using it.
        </p>
      </LegalSection>

      <LegalSection title="Your data">
        <p>Your data stays yours. How it is handled is described in the <Link href="/privacy" className="underline underline-offset-4">privacy page</Link>.</p>
      </LegalSection>

      <LegalSection title="Ending your use">
        <p>You can stop at any time: remove your connections, and ask for your data to be removed. Access may be ended if these terms are broken or the service is closed.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>These terms may change; the date at the top changes with them, and continuing to use Billfold after a change means you accept the new version.</p>
        <ContactLine email={contactEmail()} />
      </LegalSection>
    </LegalShell>
  );
}
