# Adithya Global School

A Cloudflare Worker serves the school website. A private Google Sheet controls the homepage, faculty directory, individual profiles and gallery. Approved photos are served from private Google Drive files.

## 1. Set up Google Sheets and Drive

1. Create one private Google spreadsheet. Import each file in `examples/` into its own tab, keeping the exact tab names `SITE`, `FACULTY_MASTER` and `GALLERY`. Keep the header row in row 1. The tabs can initially contain just their headers.
2. In `SITE`, edit the values for `tagline`, `about`, `admissions` and `contact`. Use one row per key and keep the text suitable for public display.
3. In `FACULTY_MASTER`, use a stable, unique Faculty ID such as `AGSF001`. Add a Status dropdown with `Working` and `Relieved`, and insert standard Google Sheets checkboxes for Published. A checked Working row appears in the directory and has a clickable profile. Changing the status to Relieved or clearing Published removes its listing, profile URL and photo URL on the next request. Use only approved professional information in the profile columns.
4. In `GALLERY`, give each photo a unique Image ID and check Published when approved. Use letters, digits, underscores or hyphens for IDs. The row order controls the display order in both lists.
5. Upload approved images to a dedicated private Drive folder. Use the file ID from the Drive URL (the segment after `/file/d/`) in the relevant Sheet column. Use JPEG, PNG, WebP, GIF or AVIF files. Keep files and the sheet private in Google Drive.
6. In a Google Cloud project, enable the Google Sheets API and Google Drive API. Create a dedicated service account and a JSON key. Share the spreadsheet and the dedicated photo folder with that service account as Viewer. Give it access only to the files intended for this website. Files marked for publication will be served publicly through the website.

## 2. Run locally

Use Node.js 22 or newer. Copy `.dev.vars.example` to `.dev.vars` in this directory. Fill in the spreadsheet ID from the spreadsheet URL, and the service account's `client_email` and `private_key` from the Google key file. Keep the private key inside double quotes with escaped newlines as shown in the example. Keep both files out of Git.

Run `npx wrangler@4 dev` from this directory. Open the local URL Wrangler prints. Test a faculty card and its photo, change the row to Relieved, then reload the listing and open the old profile and photo URLs directly. Both direct URLs should return 404.

The Worker reads the Sheet for each page or image request and sends responses with caching disabled. Open pages pick up changes on reload or on the next navigation. A Sheets error returns a temporary unavailable page instead of showing stale data. Watch Google API quotas as traffic grows.

## 3. Deploy after approval

1. Put this directory in a dedicated GitHub repository. The Google key and local secrets belong outside the repository.
2. In Cloudflare Workers & Pages, connect that GitHub repository to a new Worker using Wrangler configuration from this directory. Set `GOOGLE_SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_EMAIL` as runtime variables and `GOOGLE_PRIVATE_KEY` as a runtime secret. Wrangler configuration deliberately leaves the custom domain unset.
3. Test the site on the Worker's `workers.dev` URL with the actual Sheet and Drive files. Verify that the faculty listing, detail and image URLs reflect status changes.
4. In the Worker settings, add `school.vidhai.tech` as a **Custom Domain** after DNS approval. Review the generated DNS change and the temporary TXT record for that hostname. Remove the placeholder after the site is confirmed live if Cloudflare permits both records. If Cloudflare reports a conflict, confirm the placeholder removal before retrying. Verify HTTPS on the school hostname and check the existing root site.

References

- [Cloudflare Workers Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Cloudflare Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Google service account authentication](https://developers.google.com/identity/protocols/oauth2/service-account)
