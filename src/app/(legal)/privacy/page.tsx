import { ContactLine, LegalSection, LegalShell } from "@/components/features/legal/legal-shell";
import { LEGAL_UPDATED } from "@/constants/legal";
import { appHost, contactEmail, operatorName } from "@/lib/contact";

export const metadata = {
  title: "Privacy Policy",
  description: "How Billfold accesses, uses, stores, shares and deletes your Google data and your bill information.",
};

const SCOPES = [
  {
    scope: "Sign in with Google (name, email address, profile picture)",
    what: "Identifies who you are and checks that you have been invited. Billfold keeps your name, email address and picture so it can show who did what.",
    when: "When you sign in.",
  },
  {
    scope: "Gmail, read-only (gmail.readonly)",
    what: "Looks through the mailbox you connect for emails that match the senders, subjects and attachment rules you wrote for a source. For matching emails Billfold reads the sender, subject and date, downloads the message and its attachments (usually a bill PDF), reads the amount and due date, and files the PDF. It does not change, label, move or delete anything in your mailbox, and it ignores every email that does not match your rules.",
    when: "Only when someone presses Start run, or tests a source against the mailbox.",
  },
  {
    scope: "Gmail, send (gmail.send)",
    what: "Sends the monthly summary email, with the bill PDFs attached, from the connected Gmail account to the people you choose. It cannot read your mail with this permission.",
    when: "Only when someone presses Send. Nothing is sent on a schedule.",
  },
  {
    scope: "Google Drive (drive)",
    what: "Looks for folders by name so that bills go into the folder you chose (for example bills/Oct26), creates folders that are missing, uploads the bill PDFs and documents you attach, and downloads the files Billfold itself stored in order to attach them to a summary email. Billfold does not read, list or change any other file in your Drive.",
    when: "When a run files a bill, when a bill with a document is added, and when a summary is sent.",
  },
] as const;

const PROCESSORS = [
  ["Supabase", "Stores the database (your organisation, bill details, recipients, encrypted secrets) and handles Google sign-in."],
  ["Vercel", "Hosts the application and runs its server code. Server logs are kept by Vercel for a short time."],
  ["Upstash", "Keeps a copy of lists and reports so pages open quickly (up to 35 days, replaced whenever the data changes), and Google access tokens in sealed form (up to 45 minutes). It is a cache: anything in it can be rebuilt from the database."],
  ["Google", "Provides sign-in, Gmail and Drive, which is where your data already lives."],
  ["Your own mail provider", "Only if you connect a mailbox or a sending account with an app password: Billfold talks to that server to read or send mail on your behalf."],
  ["Google Gemini (optional)", "Only if the operator has switched it on: an unlocked bill PDF is sent to read the amount. See below."],
] as const;

export default function Privacy() {
  const operator = operatorName();
  const host = appHost();
  return (
    <LegalShell title="Privacy Policy" updated={LEGAL_UPDATED}>
      <p>
        This policy explains what <strong>Billfold</strong>{host ? <> (at {host})</> : null} does with your information, in particular the data it receives from your Google account.
        Billfold is a private, invite-only web application for families and small teams. It collects recurring bills from email, removes PDF passwords,
        reads the amounts, files the PDFs in Google Drive, lets you review them, and can email a summary. It is {operator ? <>operated by {operator}</> : "operated by an individual (the Billfold operator), not by a company"}, who is the
        person responsible for your data under this policy.
      </p>

      <LegalSection title="The short version">
        <ul className="list-disc space-y-2 pl-6">
          <li>Billfold only uses your Google data to give you the features you asked for: finding your bills, filing them in your Drive, and sending your summaries.</li>
          <li>It does not sell your data, show advertising, or use it for anything unrelated to those features. It has no analytics or tracking scripts.</li>
          <li>Bill PDFs live in <em>your</em> Google Drive. Billfold keeps only the details it needs to show you a list: biller, amount, dates, and where the file is.</li>
          <li>Passwords and Google access tokens are encrypted before they are stored.</li>
          <li>You can disconnect Google at any time, delete your data, and ask for everything to be removed.</li>
        </ul>
      </LegalSection>

      <LegalSection title="1. Information Billfold collects">
        <h3 className="font-medium">From your Google account (only with your permission)</h3>
        <p>When you sign in, Billfold receives your name, email address and profile picture. When you connect Gmail or Google Drive, Billfold asks Google for the specific permissions in the table in section 3, and receives a token that lets it act for you. It never sees your Google password.</p>
        <h3 className="mt-2 font-medium">From the mailbox you connect</h3>
        <p>For emails that match a source you defined: the sender, subject, date, the body text, and the attachments (usually a bill PDF). If a PDF is locked, Billfold uses the password you saved or the one the email carries, unlocks it in memory, and does not store the password with the bill.</p>
        <h3 className="mt-2 font-medium">What you enter</h3>
        <p>Your organisation name and members; the sources, folder paths and file name patterns you write; the people on your recipient list (name and email address); email templates; bill details you type or correct; documents you attach to a bill; and the app passwords you give for mailboxes you connect that way.</p>
        <h3 className="mt-2 font-medium">What Billfold works out</h3>
        <p>The biller name, amount, bill date and due date it reads from each bill, and a note when it is unsure.</p>
        <h3 className="mt-2 font-medium">Technical data</h3>
        <p>Records of what was done in an organisation (an audit log with who, what and when, never passwords or tokens), error messages kept by the hosting provider, and the cookies that keep you signed in. No advertising or analytics cookies are used.</p>
      </LegalSection>

      <LegalSection title="2. How Billfold uses it">
        <ul className="list-disc space-y-2 pl-6">
          <li>To sign you in and to check, on every request, that you are still allowed in and which organisation and role you have.</li>
          <li>To find the bills you described, read them, file them in your Drive, and show them to you, with totals and reports.</li>
          <li>To send the summary emails you ask for, one at a time, to the people you choose.</li>
          <li>To keep the service working and secure: preventing misuse, fixing faults, keeping an audit log.</li>
        </ul>
        <p>Billfold does not use your data for advertising, profiling, or any purpose unrelated to the above.</p>
      </LegalSection>

      <LegalSection title="3. What each Google permission is used for">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Google permissions">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Permission</th>
                <th scope="col" className="py-2 pr-4 font-medium">What Billfold does with it</th>
                <th scope="col" className="py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {SCOPES.map((s) => (
                <tr key={s.scope} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-4 font-medium">{s.scope}</th>
                  <td className="py-3 pr-4">{s.what}</td>
                  <td className="py-3">{s.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Billfold asks for each permission only when you press the matching connect button, and only the permissions it needs for that connection.</p>
      </LegalSection>

      <LegalSection title="4. Google API Services User Data Policy (Limited Use)">
        <p>
          Billfold&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" className="underline underline-offset-4" rel="noopener noreferrer">Google API Services User Data Policy</a>,
          including the Limited Use requirements. In particular, Billfold:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>uses data from Gmail and Google Drive only to provide and improve the user-facing features described in this policy, which are visible in the app;</li>
          <li>does not transfer this data to others except as needed to provide those features (for example, the hosting and storage providers in section 5), to comply with the law, or as part of a merger or sale with notice to users;</li>
          <li>does not use this data for serving advertisements, including retargeting or interest-based advertising;</li>
          <li>does not allow people to read this data, except with your permission, where it is needed for security or to investigate misuse, or where the law requires it;</li>
          <li>does not use this data to develop, improve or train generalized artificial-intelligence or machine-learning models.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Who else handles the data">
        <p>Billfold shares data only with the services it is built on, and only so that they can provide that service. They are:</p>
        <ul className="space-y-2">
          {PROCESSORS.map(([name, text]) => <li key={name}><strong>{name}.</strong> {text}</li>)}
        </ul>
        <p>Billfold does not sell personal information and does not share it with anyone else, except where the law requires it.</p>
        <h3 className="mt-2 font-medium">Reading amounts with Gemini</h3>
        <p>
          By default Billfold reads amounts from the text inside the PDF on its own server and sends nothing anywhere. The operator can instead switch on Google&rsquo;s Gemini service to read
          harder PDFs. Billfold only does this when the operator has confirmed the Gemini account is one whose terms say content is <em>not</em> used to train Google&rsquo;s models;
          otherwise it stays off. What is sent is the unlocked bill PDF and a fixed instruction. Never sent: passwords, email subjects, sender addresses or access tokens.
        </p>
      </LegalSection>

      <LegalSection title="6. How the data is protected">
        <ul className="list-disc space-y-2 pl-6">
          <li>All connections use HTTPS.</li>
          <li>Saved PDF passwords, app passwords and Google tokens are encrypted with a key that belongs to your organisation before they are stored; the keys are kept apart from the data.</li>
          <li>Every page and every action checks that you are still allowed in and that you belong to the organisation whose data you ask for. Organisations cannot see each other&rsquo;s data.</li>
          <li>The database refuses direct access from outside the application.</li>
          <li>Anything typed by a person or taken from a bill is made safe before it is shown or put into an email.</li>
          <li>Secrets are never written to logs or shown on screen.</li>
        </ul>
        <p>No system is perfectly secure. If a problem affecting your data is found, the operator will tell the people affected.</p>
      </LegalSection>

      <LegalSection title="7. Where it is stored, and for how long">
        <p>The database, the hosting and the cache are in the Mumbai (India) region where the providers allow it. Google processes Gmail and Drive wherever Google does.</p>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Your sign-in details and organisation data:</strong> kept while your organisation exists and you are a member.</li>
          <li><strong>Bill details and recipient lists:</strong> kept until you delete them. A deleted bill is hidden at once and kept only so the same email is not filed again.</li>
          <li><strong>Documents:</strong> they are in your Google Drive and stay there until you delete them. Billfold never deletes your Drive files.</li>
          <li><strong>Sent summary emails:</strong> the finished message and who it went to are kept in the sent log until the organisation is deleted.</li>
          <li><strong>Cached copies:</strong> up to 35 days, replaced whenever the data changes (Google access tokens up to 45 minutes, encrypted).</li>
          <li><strong>Server logs:</strong> kept by the hosting provider for a short period.</li>
          <li><strong>Backups:</strong> removed data may remain in a database backup until the backup expires.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Your choices, access and deletion">
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Disconnect Google.</strong> On the Connections page, remove a connection. Billfold then tells Google to forget it and deletes its stored token. You can also remove Billfold at <a href="https://myaccount.google.com/permissions" className="underline underline-offset-4" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</li>
          <li><strong>Delete your data.</strong> Delete bills and recipients in the app. Deleting an organisation hides it for everyone and permanently destroys its encryption key, so its saved passwords and tokens can never be read again.</li>
          <li><strong>See or correct your data.</strong> Everything Billfold holds about you is visible in the app (bills, recipients, members, audit log). You can correct bills yourself.</li>
          <li><strong>Ask us.</strong> You can ask for a copy of your data or for it to be deleted (see the contact details below). Requests are answered within 30 days.</li>
        </ul>
        <p>Removing access stops Billfold from reading or sending anything new; files already in your Drive are yours and are not touched.</p>
      </LegalSection>

      <LegalSection title="9. Cookies">
        <p>Billfold uses only the cookies needed to keep you signed in and to protect the sign-in process. It does not use advertising or analytics cookies, and it does not track you across other sites.</p>
      </LegalSection>

      <LegalSection title="10. Children">
        <p>Billfold is for adults who manage household or team bills. It is not directed at children and does not knowingly collect their data.</p>
      </LegalSection>

      <LegalSection title="11. Changes to this policy">
        <p>If this policy changes, the date at the top changes. If a change is significant (for example, a new Google permission), Billfold will ask for your permission again before using it.</p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>For questions about this policy, to see, correct or delete your data, or to report a problem:</p>
        <ContactLine email={contactEmail()} />
      </LegalSection>
    </LegalShell>
  );
}
