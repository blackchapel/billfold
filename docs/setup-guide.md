# Setup guide (plain language, step by step)

You will set up three things: **Supabase** (database and login plumbing), **Google Cloud** (the "Sign in with Google"
button) and **Vercel** (hosting). Everything below is free. Do the steps in order. It all works from a phone browser
(use "Desktop site" where a page looks cramped). Do not paste secrets into chat; paste them only into the Vercel or
GitHub boxes described here.

Words used: **env variable** = a named setting stored in Vercel/GitHub instead of in the code, so secrets never sit in the repo.

---

## 0. What you will end up with

| Branch | Where it runs | Purpose |
|---|---|---|
| `develop` | Vercel "Preview" deployment at a stable address | You test here |
| `main` | Vercel "Production" deployment on your domain | Real use |

Every push to `develop` redeploys the preview. Merging `develop` into `main` redeploys production.

---

## 1. Supabase (database)

1. Go to supabase.com, sign in with GitHub, tap **New project**. Name it `billfold`. Pick the region closest to you
   (for India, "Mumbai" if offered). Set a **database password** and save it in a password manager. Tap Create.
2. Wait for it to finish (about two minutes).
3. Tap **Project Settings** (gear) > **API**. Copy:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe to expose; the database denies it everything)
4. Tap **Connect** (top bar) or **Project Settings > Database > Connection string**:
   - **Session pooler** string (port **5432**, host `…pooler.supabase.com`, username `postgres.<project-ref>`) → this is `DATABASE_URL` for Vercel
     **and** the GitHub migrate secrets. Do not use the Transaction pooler (6543) on Vercel: it hung and returned instant statement timeouts
     on reused serverless instances (see Gotchas in CLAUDE.md). Replace `[YOUR-PASSWORD]` with your DB password.
   - Do **not** use the "Direct connection" string: it is IPv6-only on the free plan, so neither Vercel nor GitHub's runners can reach it. If your password has special characters (`@ : / # ? %`), URL-encode them or reset the password to letters and numbers.
5. Free projects pause after about a week of no activity. Billfold includes a daily keep-alive (`vercel.json`) that prevents this.

Optional but recommended: make a **second** Supabase project (`billfold-dev`) for `develop` so test data never mixes with
real data. The free plan allows two projects. If you skip it, both branches share one database.

## 2. Google Cloud, project A (sign-in with Google)

1. Go to console.cloud.google.com. Top bar > project picker > **New project**, name it `Billfold Login`.
2. Menu > **APIs & Services > OAuth consent screen** (may be called "Google Auth Platform").
   - User type **External**. App name **Billfold**. Support email: yours. Developer contact: yours.
   - Scopes: only the defaults (**openid, email, profile**). Add nothing else for this project.
   - Publishing status: **In production** (tap "Publish app"). Basic scopes do not need Google review.
3. **Credentials > Create credentials > OAuth client ID**. Type **Web application**, name `Billfold login`.
   - **Authorised redirect URI**: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
     (your Project URL from step 1 plus `/auth/v1/callback`). Add the `billfold-dev` project's one too if you made it.
   - Create. Copy the **Client ID** and **Client secret**.
4. Back in Supabase: **Authentication > Sign In / Providers > Google**. Switch it on, paste the Client ID and Secret, save.
5. Supabase **Authentication > URL Configuration**:
   - **Site URL**: your production address (for now your Vercel production URL).
   - **Redirect URLs**: add each of these (replace names):
     - `https://YOUR-PRODUCTION-DOMAIN/auth/callback`
     - `https://billfold-git-develop-YOUR-VERCEL-TEAM.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback`

Drive and Gmail connections use the separate steps in **2b** below (Phase 2).

## 2b. Google Cloud for connections (Drive and Gmail)

These are **not** the login client from step 2. Billfold talks to Google directly here (not through Supabase), so the
redirect address is Billfold's own: `https://YOUR-DOMAIN/api/connections/google/callback`. Leave the Connect buttons alone
until this is done; they show "not set up yet" and nothing breaks.

**Drive (project A, the verified one).**
1. console.cloud.google.com > project A > **APIs & Services > Library** > enable **Google Drive API**.
2. **OAuth consent screen > Data access**: make sure `.../auth/drive` (see, edit, create and delete all your Google Drive files) is listed. This is a *restricted* scope: until Google verifies the app, only the test users you list can connect, and Google will want a security assessment before it opens to everyone. Billfold uses it only to find your chosen folder by name, create missing folders and upload bill files (see the privacy page). Drives connected earlier show **needs more permission**: press **Reconnect** on each once.
3. **Credentials > Create credentials > OAuth client ID** > Web application, name `Billfold Drive`. Under **Authorized redirect URIs** add one line per place Billfold runs:
   `https://YOUR-PRODUCTION-DOMAIN/api/connections/google/callback` and `https://YOUR-DEVELOP-DOMAIN/api/connections/google/callback` (the same address you set as `NEXT_PUBLIC_APP_URL`).
4. Copy the client ID and secret into Vercel as `GOOGLE_A_CLIENT_ID` and `GOOGLE_A_CLIENT_SECRET` (Production and Preview).

**Gmail (project B, the unverified one).**
1. Create a second Google Cloud project, enable the **Gmail API**.
2. **OAuth consent screen**: External, **Testing** mode. Under **Test users** add every Google address that will connect a mailbox (up to 100). Add scopes `gmail.readonly` and `gmail.send`.
   Google shows an "unverified app" warning; tap **Advanced > Continue**. Testing-mode refresh tokens expire after **7 days**, so a Gmail connection
   will show "needs attention" and must be reconnected weekly. For no expiry, move the consent screen to **In production** (still unverified: up to 100 users, same warning, tokens last).
3. Create a Web client `Billfold Gmail` with the same two redirect URIs as above.
4. Put the ID and secret in Vercel as `GOOGLE_B_CLIENT_ID` and `GOOGLE_B_CLIENT_SECRET`. Redeploy.

**App passwords instead of Gmail sign-in.** In Billfold > Connections you can add any mailbox that offers IMAP (to read bills) and SMTP (to send).
For Gmail: Google Account > Security > 2-Step Verification on > **App passwords** > create one. Billfold tests the login before saving it.

**Google's verification looks at your privacy page, so it must be reachable by anyone.** Google's crawler opens the URL you enter *without signing in*. On Vercel, the domain `billfold-dev.blackchapel.vip` is attached to the `develop` branch, which is a preview deployment, and **Vercel Authentication** answers it with a redirect to a Vercel login page (checked: `/privacy` returns a 302 to vercel.com/sso-api), so Google sees a login screen, not your policy. That is the reason for "privacy policy page does not have sufficient content". Fix it one of two ways: (a) use your **production domain** (`billfold.blackchapel.vip`) for the home page, privacy and terms links in the consent screen, after merging `develop` into `main` so that domain serves `/privacy` and `/terms` (today it still serves the old build); or (b) in Vercel > Project Settings > Deployment Protection, set Vercel Authentication to **Disabled** (or "Only Production Deployments" does not help: this domain is a preview) for as long as verification runs. Then open the privacy URL in a private window to confirm you see the policy. Also fill in `NEXT_PUBLIC_CONTACT_EMAIL` and `NEXT_PUBLIC_OPERATOR_NAME` (below): Google wants a way to contact you on the page.

**Consent screen links (both projects).** On each project's **OAuth consent screen > Branding**, fill in: **Application home page** `https://YOUR-PRODUCTION-DOMAIN/`, **Application privacy policy link** `https://YOUR-PRODUCTION-DOMAIN/privacy`, **Application terms of service link** `https://YOUR-PRODUCTION-DOMAIN/terms`, and add your domain under **Authorized domains**.
These pages are public, so Google can open them without signing in (a verified app, project A, needs them to stay reachable). Upload `public/icon-512.png` as the app logo if asked. The privacy page already carries Google's Limited Use statement. **Read `/privacy` and `/terms` once yourself** and change them if anything does not match how you run Billfold; they are plain-language text, not legal advice.

**Upstash Redis (optional, speeds pages up).** At console.upstash.com create a Redis database (free plan, region **ap-south-1 Mumbai**, same region as Vercel and Supabase). Copy its REST URL and REST token into Vercel as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (Production and Preview), then redeploy. Without them nothing is cached and everything still works. If a screen ever looks out of date, Settings > Cache > **Clear the cache**. The free plan has a monthly command limit; a page view uses a handful.

**Reading amounts with Gemini needs one more setting.** Set `GEMINI_NO_TRAINING_CONFIRMED=1` in Vercel *only if* the Gemini key belongs to a billing-enabled (paid) Google AI account, whose terms say content is not used to train models. Without it Billfold uses its built-in text reader and sends nothing to Gemini. Do not confirm it for a free-tier key: Google's rules for Gmail data forbid training models on it.

## 3. Secrets you generate yourself

You need two random strings. Do **not** use a random website to make them. Easiest on a phone: open
**shell.cloud.google.com** (free Cloud Shell, signs in with your Google account) and run:

```
openssl rand -base64 32     # run once → MASTER_ENCRYPTION_KEY
openssl rand -hex 24        # run again → CRON_SECRET
```

Save both in a password manager. **If you lose `MASTER_ENCRYPTION_KEY`, every stored password and token becomes
unrecoverable.** Use a *different* `MASTER_ENCRYPTION_KEY` for develop and production.

## 4. Vercel (hosting)

1. vercel.com > sign in with GitHub > **Add New > Project** > import `blackchapel/billfold`.
2. Framework: Next.js (auto-detected). Leave build settings alone.
3. **Settings > Git**: set **Production Branch** to `main`. (`develop` will automatically become a Preview.)
4. **Settings > Environment Variables**. Add each variable below. For every one choose the right **environment** tick-boxes
   (Production for `main`; Preview for `develop`):

| Name | Production value | Preview value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | production Supabase URL | develop Supabase URL (or same) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon key | develop anon key |
| `DATABASE_URL` | production **Session pooler** string (5432) | develop Session pooler string (5432) |
| `MASTER_ENCRYPTION_KEY` | key #1 | a different key #2 |
| `SUPER_ADMIN_EMAILS` | your Gmail | your Gmail |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-PRODUCTION-DOMAIN` | `https://billfold-git-develop-YOUR-VERCEL-TEAM.vercel.app` |
| `CRON_SECRET` | secret from step 3 | same or another |
| `GOOGLE_A_CLIENT_ID` / `GOOGLE_A_CLIENT_SECRET` | from step 2b (optional until then) | same |
| `GOOGLE_B_CLIENT_ID` / `GOOGLE_B_CLIENT_SECRET` | from step 2b (optional until then) | same |
| `GEMINI_API_KEY` (and optional `GEMINI_MODEL`) | optional, see 6b before setting | optional |

   In the Add dialog, tick only **Production** for the first column and only **Preview** for the second. For the Preview
   ones you can pin them to the `develop` branch.
5. **Deployments** > redeploy after adding variables (variables apply to *new* deployments only).
6. Domain: **Settings > Domains**, add your domain and follow the DNS instructions at your registrar.
7. Find your exact develop address under **Deployments** by opening the latest `develop` deployment (the "Branch" link).
   Put that exact address in `NEXT_PUBLIC_APP_URL` (Preview) and in the Supabase Redirect URLs from step 2.

Never add `BILLFOLD_TEST_MODE` or `TEST_DATABASE_URL` to Vercel. Test mode is also blocked in production by code.

## 5. Create the database tables (migrations)

Tables are created by running the SQL files in `drizzle/`. From your phone, use the GitHub Action:

1. GitHub repo > **Settings > Secrets and variables > Actions > New repository secret**:
   - `DATABASE_URL_DEVELOP` = the **Session pooler** string (port 5432) of the develop database
   - `DATABASE_URL_PRODUCTION` = the Session pooler string of the production database
2. **Actions** tab > **Database migrate** > **Run workflow** > choose `develop` > Run. Check for a green tick.
   Repeat with `production` after you merge to `main`. Run it again whenever a phase adds new migrations.

## 6. First sign-in

1. Open the preview address. Tap **Sign in** > **Continue with Google** with the Gmail in `SUPER_ADMIN_EMAILS`.
2. You land on "Welcome". Create an organisation.
3. Open `/admin`, add the Google emails of anyone you want to let in (they must be on this list even with an invite code).
4. In your org: **Invites** > create a code > send it to them. They sign in, then paste the code.

## 6b. Set up your first bills (after sign-in)

1. **Connections**: connect a mailbox (Gmail through Google, or any mailbox with an app password) and a **Google Drive**. Press **Test** on each.
2. **Sources**: **New source** for each kind of bill. Pick the mailbox, list who sends it (an address like `billing@jio.com` or a whole domain like `jio.com`),
   optionally a word the subject must contain, and say how the PDF is locked (not locked, one saved password, or the password written in the email subject
   in brackets, as Jio does). Press **Test against mailbox**: it lists matching emails from the last 90 days with passwords hidden, and nothing is downloaded or saved.
3. **Run configs**: **New run configuration**: tick the sources, choose the Drive and a folder name, and the default month.
4. **Runs**: choose a run configuration and a month, then **Start run**. Billfold lists the matching emails, then files them one by one while you watch: it opens locked PDFs, reads the amount, saves the PDF in
   Drive under `<folder>/<month>/<source>` and records the bill. Keep the page open until it says *Finished*; if you close it, open the run again to carry on. Items that fail show why
   (for example a wrong PDF password) and can be tried again. Running the same month twice is safe: bills already filed are skipped.

**Reading amounts with Gemini (optional).** Without a key, Billfold reads amounts itself from the PDF text and nothing leaves Billfold (scans and unusual layouts are flagged *needs review*).
To use Gemini: create a key at aistudio.google.com, add `GEMINI_API_KEY` in Vercel (and optionally `GEMINI_MODEL`, default `gemini-2.5-flash`), redeploy. **Before you do:** on Google's free tier, content you send may be used to improve
Google's products. Billfold sends only the unlocked bill PDF, but bills are personal. Use a paid key, or leave the key unset, if that is not acceptable.

5. **Bills**: everything the runs filed. Bills the reader was unsure about (a scan, no amount found) are marked *Needs a check*; open one, compare it with the PDF (the *Open in Drive* link), correct the amount and tick
   *I have checked this bill*. Use **Add a bill** for anything that never came by email; you can attach its document (PDF or picture up to 4 MB), pick the Drive and a folder path, and it is filed under the name it has. Mark bills paid so the due-date warnings stay accurate; **Download CSV** gives you the list for a spreadsheet.
   **Where the PDFs go.** On a source, **Where the PDFs go** lets you set a folder path (for example `bills/{{Mon}}{{yy}}`, giving `bills/Oct26`) and a file name (for example `phone-bill_xxxx-{{Mon}}{{yy}}`). `{{Mon}}` is Oct, `{{mon}}` oct, `{{MON}}` OCT, `{{Month}}` October; `{{yy}}` 26, `{{year}}` 2026, `{{mm}}` 10, `{{source}}`, and `{{original}}` for the attachment's own name (file name only). The form shows an example as you type. The path starts at the top of your Drive and uses folders that already exist; this needs the Drive to have been reconnected with full access. Leave both empty for the standard layout.
6. **Reports**: the total for a month, the last twelve months as a chart, a table by biller with the change since last month, and what is overdue or due this week. Overdue and due-soon lists only count bills that have a due date and are not marked paid.

7. **Recipients**: add the people who should get the monthly summary (name and email address; each gets their own email). **Templates** (optional): the standard wording is built in; add your own subject, opening and closing text
   using the listed `{{placeholders}}` and choose a default.
8. **Send**: choose the month, the wording, the account to send **from** (a Gmail connection made through project B, which needs the `gmail.send` permission and is granted when you connect it, or an SMTP app-password account added under Connections as "Sending summaries (SMTP)"),
   tick the recipients and press **Preview the email**. **Send me a test** sends only to you with `[Test]` in the subject: do this first with your real account. Then **Send to N people**; keep the page open until it says *Sent*. Bill PDFs are attached (up to 40 files / 18 MB in one email; above that none are attached and the preview says so).
   Each person's delivery is shown separately, with **Try again** for any that failed. The **Sent emails** list keeps every email exactly as it went out. Members can read all of this; sending needs the `reports.send` permission (owners and admins have it; grant it to a member under Members).
   Gmail connections already ask Google for the permission to send (project B's consent screen lists `gmail.send`, step 2b). If a send says it is not allowed, add that scope to the consent screen and press **Reconnect**.

Things to know: a connection that a source or run configuration uses cannot be removed until those are changed or deleted. Mail read over IMAP is taken from the INBOX only.
Gmail connections made while project B is in *Testing* mode expire after 7 days: the Overview page then shows "needs attention" and **Reconnect** on the Connections page fixes it.
A daily check (second cron job in `vercel.json`) notices expiries by itself.

## 7. When something goes wrong

| Symptom | Likely cause |
|---|---|
| "Invalid or missing environment variables: …" | A variable from step 4 is missing for that environment; add and redeploy |
| Google says `redirect_uri_mismatch` | The redirect URI in step 2.3 is not exactly `…supabase.co/auth/v1/callback` |
| After Google, you return to sign-in with an error | Supabase Redirect URLs (step 2.5) missing the exact `/auth/callback` address |
| "not authorised" page | The email is not in `/admin` list and not in `SUPER_ADMIN_EMAILS` |
| A run item says "The password did not open this PDF" | Edit the source: the saved password or the subject pattern is wrong. Then **Try again** on the run |
| A run item failed with "Could not save the PDF to Google Drive" | Reconnect the Drive on the Connections page, then **Try again** |
| Connection says "needs attention" | Press **Reconnect** (Google) or **Update app password** (mail). Gmail Testing-mode tokens last 7 days |
| A source finds no emails | Use **Test against mailbox**: check the sender spelling, loosen subject/attachment rules, or the mail may not be in the INBOX (IMAP) |
| Send says "The email could not be sent" | Check the sending account on the Connections page (**Test**), then **Try again**. If Gmail refuses, **Reconnect** it and check project B lists `gmail.send`. Gmail's own limit is about 500 emails a day |
| Preview says no PDFs are attached | Too many or too large for one email (40 files / 18 MB); the bills still link to Drive. Send fewer months or untick "Attach the bill PDFs" |
| Privacy page says "Ask the person who invited you" | Optional: set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel to an address people can write to, then redeploy |
| Database errors on first load | Migrations not run (step 5) or `DATABASE_URL` is the direct string instead of the pooler |
| Supabase project paused | Open it in Supabase and tap Restore; check the daily cron ran under Vercel > Cron Jobs |
