# Baby Gift List

A full-width, responsive, working gift list based on the **approved original woodland concept**, not a regenerated variation.

Production: https://baby-gift-list.vercel.app

## Run

This is a dependency-free static site. Serve the repository root, for example:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. A local server is needed because the registry is loaded from JSON.

## Content and behavior

- All 56 original registry entries and their shopping links are preserved in `data/registry.json`.
- The 12 purchased entries remain purchased. Homepage progress and category counts are computed from this real data, not the illustrative numbers in the concept.
- The homepage shows the exact 27 featured products from the approved reference, with three- and four-product cards kept on one row.
- Category links, the Gift List navigation item, and purchased/needed counters open searchable, filterable gift browsing dialogs.
- Product cards open details and external shopping links. The share controls use native sharing or copy the website address.
- Purchase status is maintained by the owner. The site does not automatically detect external purchases or provide shared gift reservations.

## Design source and artwork

`docs/approved-reference.png` is the original approved image with only the simulated browser chrome removed. Its content canvas is 1430 × 1034.

`assets/approved/` contains optimized WebP crops of that exact source: original woodland surroundings, flowers, trees, animals, wooden signs, product artwork, and hand-lettered headings. These are separate assets used with semantic HTML, live text, real controls, and registry data. The website is not a single image with click hotspots.

`assets/approved/manifest.json` records source coordinates and file sizes. No substitute emoji, newly drawn foliage, or later generated concept variants are used on the homepage. The hero and footer artwork have their UI text removed so real content can be rendered independently. Original branded lettering is retained as accessible image headings.

At desktop widths the layout follows the reference's measured proportions across the entire viewport. Tablet and phone breakpoints reflow the same content and artwork; there is no separate approved mobile reference.

The browser chrome in the concept is not reproduced inside the website. Real registry numbers intentionally differ from the mockup's sample numbers. Native text rasterization can also vary between operating systems and browsers; the reference should remain the visual acceptance source, not a claim of universal pixel identity.

## Browser verification

```sh
python -m pip install playwright==1.56.0
python -m playwright install --with-deps chromium
python tests/browser_check.py
```

This captures screenshots at 1430, 1920, 1100, 1024, 768, 390, and 320 pixels; checks missing images, console errors, horizontal overflow, categories, and featured items; and exercises product dialogs, purchased filtering, category browsing, searching, and keyboard closing.

To check production:

```sh
python tests/browser_check.py --base-url https://baby-gift-list.vercel.app --output qa-production
```

Compare `qa-output/after-1430.png` with `docs/approved-reference.png` at native size. Screenshot evidence is necessary before describing a design change as verified. A successful Vercel deployment alone is not a visual acceptance check.

## Deployment

Vercel is connected to `adriandarian/baby-gift-list`. Production uses `main`. No build command, application framework, runtime secrets, or server functions are required.

## Updating the registry from a browser

The approved woodland design remains the public website. The private editor is at
`https://baby-gift-list.vercel.app/manage.html`. Once configured, it lets you:

- Mark items **Still needed**, **Reserved**, **Partly received**, or **Received**
- Track quantity needed versus quantity received, including partially gifted sets
- Add gifts, edit names, shopping links, categories, and notes
- Archive non-featured items (instead of deleting history)
- Search/filter, export a JSON backup, and review changes before saving

The repository's `data/registry.json` is the shared source of truth. Every save
makes an authenticated, revision-checked GitHub commit, which causes a normal
Vercel deployment. This means a friend using the public site may see the old
status for a short time until deployment finishes. Stale simultaneous edits
return a conflict rather than silently overwriting someone else's work.

### One-time setup (required before saves work)

In your Vercel project, go to **Settings → Environment Variables** and add
these three values for **Production**. Create them directly in Vercel, never
commit them or paste them into chat.

1. `GITHUB_REGISTRY_TOKEN` — create a fine-grained GitHub personal access token
   for **only** `adriandarian/baby-gift-list`, granting **Contents: Read and write**
   (Metadata: Read is default). The token grants publishing access, so store it
   only as a private Vercel environment variable. Consider an expiration and
   a reminder to rotate it.
2. `REGISTRY_ADMIN_PASSWORD` — your own strong, unique password of **at least
   16 characters** for the gift manager. Share only with trusted editors.
3. `REGISTRY_SESSION_SECRET` — a separate, high-entropy random string of
   **at least 32 characters** for signing eight-hour login sessions.

### Remembered devices and daily password checks

The manager remembers a successfully signed-in browser for **30 days** using a
secure, HTTP-only, signed cookie. Recognition only changes the welcome message:
**it never grants access or replaces the password**.

After entering the manager password, the authenticated session remains valid
only until **12:00 a.m. Pacific Time** (America/Los_Angeles), regardless of when
sign-in occurred or whether the browser has been remembered. Pacific daylight
saving transitions are handled automatically. Opening a page after midnight,
switching back to an old tab, or making an API request after midnight requires
typing the password again. A tab left open is checked each minute and when
it becomes visible. Signing out immediately clears its session but not the
30-day device recognition. No password is stored in a browser cookie, local
storage, or the GitHub repository.

Changing `REGISTRY_ADMIN_PASSWORD` or `REGISTRY_SESSION_SECRET` in Vercel
invalidates active sessions once the new deployment is live. The actual
password verification takes place only in the serverless API. Browser
password managers might still offer autofill despite `autocomplete=off`;
you must press Sign in to unlock the manager each new day.

**Redeploy** the project after adding environment variables. Then visit
`/manage.html`, sign in, and make your first update. The editor tells you
when setup is missing; it cannot secretly initialize credentials or create
GitHub tokens on your behalf.

**Privacy:** The repository is public. Gift names, notes, categories, and links
in the registry are public too; don't store private contact information,
addresses, or personal gift-giver names in those fields.

**Design preservation:** The featured gifts and their categories are locked
against archiving/moving so the approved homepage composition stays unchanged.
New items appear in the category browser rather than changing the illustrated
homepage. The manager itself uses its own CSS and does not affect the visual
design of the public website.

### Developer testing

`node tests/manage_api_test.cjs` tests authentication, CSRF protection,
optimistic concurrency, safe item updates, and the ability to add gifts using
a mocked GitHub response. The GitHub Actions workflow also runs browser checks
for the public site and the new manager. No real GitHub token is needed in CI.
