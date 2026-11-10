import { ContactLine, LegalSection, LegalShell } from "@/components/features/legal/legal-shell";
import { LEGAL_UPDATED } from "@/constants/legal";
import { contactEmail } from "@/lib/contact";

export const metadata = { title: "Privacy", description: "What Billfold stores, where it goes and how to have it removed." };

export default function Privacy() {
  return (
    <LegalShell title="Privacy" updated={LEGAL_UPDATED}>
      <p>
        Billfold is a private service for families and small teams. It collects your recurring bills from email, files the PDFs in your Google Drive,
        reads the amounts and can email a summary. This page says what it keeps, who else sees it and how you can have it removed.
        It is written to be read; if anything is unclear, ask (see the last section).
      </p>

      <LegalSection title="What Billfold keeps">
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Your sign-in:</strong> the name, email address and picture of the Google account you sign in with.</li>
          <li><strong>Your organisation:</strong> its name, who belongs to it and their roles, invitation records and an audit log of who changed what (never passwords or tokens).</li>
          <li><strong>Connections:</strong> for a Google connection, a token that lets Billfold act on your behalf; for a mailbox added with an app password, that password. These are encrypted with a key that belongs to your organisation before they are stored.</li>
          <li><strong>Bills:</strong> for each bill, the biller, amounts, dates, the subject of the email it came from and a note you may add. The PDF itself is stored in <em>your</em> Google Drive; Billfold keeps only the file&rsquo;s identifier, link and a fingerprint.</li>
          <li><strong>Sending:</strong> the people on your recipient list, your email templates, and each summary email exactly as it was sent, with whether it was delivered.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What Billfold does with your Google account">
        <p>Billfold asks Google for only what it needs, and only when you press a connect button:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Sign-in:</strong> your basic profile and email address, to know who you are.</li>
          <li><strong>Google Drive (access to files Billfold creates):</strong> to put bill PDFs in a folder and to attach them to a summary. Billfold cannot see the other files in your Drive.</li>
          <li><strong>Gmail, read-only:</strong> to look for emails that match the sources you described (sender, subject, attachment) and to download those emails and their attachments. Billfold does not change, delete or label anything in your mailbox, and it ignores emails that do not match.</li>
          <li><strong>Gmail, send:</strong> only to send a summary when a person presses Send. Nothing is sent on a schedule.</li>
        </ul>
        <p>
          Billfold&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to the
          {" "}<a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline underline-offset-4" rel="noopener noreferrer">Google API Services User Data Policy</a>,
          including the Limited Use requirements. Data from Google is used only to provide the features described here. It is not used for advertising,
          not sold, and not read by people except as needed to fix a problem you report, with your permission.
        </p>
        <p>You can remove a connection at any time on the Connections page; Billfold then also revokes its access at Google. You can also review or revoke access at myaccount.google.com/permissions.</p>
      </LegalSection>

      <LegalSection title="Reading amounts: Gemini (optional)">
        <p>
          By default Billfold reads amounts from the PDF&rsquo;s own text on its own server and nothing leaves it. If the person running Billfold has added a Gemini key, an unlocked bill PDF
          (and a fixed instruction, nothing else) is sent to Google&rsquo;s Gemini service to read the amount. Never sent: passwords, email subjects, addresses or tokens.
          On Google&rsquo;s free tier, content sent to Gemini may be used to improve Google&rsquo;s products. Ask whoever runs your Billfold whether Gemini is switched on.
        </p>
      </LegalSection>

      <LegalSection title="Who else handles the data">
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Supabase</strong> stores the database and handles Google sign-in.</li>
          <li><strong>Vercel</strong> hosts the application (in Mumbai).</li>
          <li><strong>Google</strong> provides sign-in, Drive and Gmail, and Gemini if switched on.</li>
          <li>The mail provider you choose, when you connect a mailbox or a sending account with an app password.</li>
        </ul>
        <p>Billfold has no advertising, no analytics and no tracking scripts. Its only cookies are the ones that keep you signed in. Data is not sold or shared with anyone else.</p>
      </LegalSection>

      <LegalSection title="How it is protected">
        <p>
          Passwords and tokens are encrypted per organisation. Every page and action checks that you are still allowed in and belong to the organisation whose data you ask for.
          Emails Billfold sends are built so that nothing typed by a person can run as code. Billfold is invite-only: only people approved by its operator can sign in.
        </p>
      </LegalSection>

      <LegalSection title="How long it is kept, and removal">
        <p>
          Data is kept while your organisation exists. Deleting a bill hides it (so the same email is not filed again); deleting an organisation hides it and permanently destroys the key that protects its saved
          passwords and tokens, so they can no longer be read. Files in your Google Drive are yours: Billfold never deletes them, and you can delete them yourself at any time.
          To have your data removed or a copy of it, ask (below). Database backups may keep removed data for a short time before they expire.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>Billfold is meant for adults managing household or team bills and is not aimed at children.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>If this page changes, the date at the top changes. Please look at it again from time to time.</p>
      </LegalSection>

      <LegalSection title="Questions and requests">
        <ContactLine email={contactEmail()} />
      </LegalSection>
    </LegalShell>
  );
}
