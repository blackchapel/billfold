import Link from "next/link";
import { ContactLine, LegalSection, LegalShell } from "@/components/features/legal/legal-shell";
import { LEGAL_UPDATED } from "@/constants/legal";
import { appHost, contactEmail, operatorName } from "@/lib/contact";

export const metadata = { title: "Terms of Service", description: "The rules for using Billfold." };

export default function Terms() {
  const operator = operatorName();
  const host = appHost();
  return (
    <LegalShell title="Terms of Service" updated={LEGAL_UPDATED}>
      <p>
        These terms apply to everyone who uses <strong>Billfold</strong>{host ? <> at {host}</> : null}, a private web application that collects recurring bills from email, files the PDFs in Google Drive and sends summaries.
        It is {operator ? <>operated by {operator}</> : "run by an individual (the Billfold operator), not by a company"}. By signing in you agree to these terms and to the{" "}
        <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>, which says what happens to your data.
      </p>

      <LegalSection title="1. Who may use Billfold">
        <p>Billfold is invite-only. You may use it if the operator approved your Google account and, for an organisation, if its owner invited you. You must be an adult. The operator may remove anyone&rsquo;s access at any time, for example if these terms are broken or the service is closed.</p>
      </LegalSection>

      <LegalSection title="2. What Billfold does with your Google account">
        <p>When you connect Gmail or Google Drive you give Billfold permission, through Google, to act for you in the ways described in the Privacy Policy: to read the emails that match the rules you wrote, to send the summaries you ask for, and to create folders and files in your Drive. You can take that permission back at any time by removing the connection in Billfold or at myaccount.google.com/permissions.</p>
        <p>Drive permission is broad: it lets Billfold find the folder you named anywhere in your Drive. Billfold only creates folders and files where you told it to, and does not open, change or delete other files. You are responsible for the folder paths you set.</p>
      </LegalSection>

      <LegalSection title="3. Your responsibilities">
        <ul className="list-disc space-y-2 pl-6">
          <li>Connect only mailboxes, Drive accounts and sending accounts that you are entitled to use, and keep their passwords private.</li>
          <li>Add only people who expect to receive your summaries. Do not use Billfold to send anything other than your own bill summaries, or to send unwanted email.</li>
          <li>Do not try to reach other organisations&rsquo; data, to disable or overload the service, or to use it for anything unlawful.</li>
          <li>Follow the terms of the services Billfold uses, including Google&rsquo;s. Google&rsquo;s own limits (for example on emails sent per day) still apply.</li>
          <li>Keep your own copies of anything important. Your original bills stay in your mailbox and your Drive.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Please check the numbers">
        <p>
          Billfold reads amounts and dates from emails and PDFs automatically, and it can be wrong, especially for scans and unusual layouts. It marks what it is unsure about for you to check,
          but you remain responsible for what you pay and for what you send to others. A summary is a convenience, not an accounting record or financial advice.
        </p>
      </LegalSection>

      <LegalSection title="5. Your content">
        <p>Your bills, documents and data stay yours. You give Billfold only the permission it needs to run the features you use, for as long as you use them.</p>
      </LegalSection>

      <LegalSection title="6. Availability and changes">
        <p>Billfold runs on free and low-cost services with limits of their own, so it may be slow, unavailable, or change without notice. Features may be added or removed.</p>
      </LegalSection>

      <LegalSection title="7. No warranty, limited liability">
        <p>
          Billfold is provided &ldquo;as is&rdquo;, without any warranty. To the extent the law allows, the operator is not liable for lost data, missed or late payments, late fees, emails that were
          not delivered or were delivered to the wrong people, or any other loss that comes from using Billfold. Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="8. Ending your use">
        <p>You can stop at any time: remove your connections and ask for your data to be removed (see the Privacy Policy). Your access may end if these terms are broken or Billfold is closed. Sections that by their nature continue (such as the limits on liability) continue afterwards.</p>
      </LegalSection>

      <LegalSection title="9. Changes to these terms">
        <p>These terms may change; the date at the top changes with them, and using Billfold after a change means you accept the new version.</p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <ContactLine email={contactEmail()} />
      </LegalSection>
    </LegalShell>
  );
}
