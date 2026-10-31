# Baby Gift List 🌿🐰

A warm, woodland-themed baby gift registry website for family and friends.

## What's included

- Responsive, single-page website with a pastel woodland look
- All **56 gifts** from the original Newborn Gift List spreadsheet, grouped into 8 categories
- **12 gifts marked purchased** based on the spreadsheet
- Search, purchased/still-needed filter, progress tracker, and share link
- Product detail popups and links to selected CYBEX, UPPAbaby, and Stokke products
- No install or build step: pure HTML, CSS, and JavaScript

## Run locally

Open `index.html` in a browser. No dependencies are required. Internet access is only needed to load Google Fonts and external shopping pages.

## Deploy with Vercel

The site is deployed to **https://baby-gift-list.vercel.app** on Vercel, with GitHub repository `adriandarian/baby-gift-list` linked to the Vercel project. Production deployments use the `main` branch.

This is a static HTML/CSS/JavaScript site with no build command or environment variables required. Vercel's deployment protection has been disabled for family and friends to view the site.

## Keeping the registry accurate

**Important:** This is a read-only gift registry. Gift statuses are based on the imported spreadsheet and **do not automatically update** when someone buys an item. Family members should notify the registry owner after purchasing a gift. Update the item data within the `items` array in `index.html` to change a gift from needed to purchased.

When editing an item, the fourth field can be `true` to mark it purchased, or a string URL for a shopping link. Example:

```js
["Soft hooded towels", "Bath & Care", "🧸", true]
["Stroller", "Travel", "👶", "https://example.com/stroller"]
```

For public, multi-user claims, reservation locks, or automatic status syncing, add a shared backend (such as Supabase or Firebase) before relying on claims to prevent duplicate purchases.

## Accessibility and content notes

The page uses semantic sections, accessible button labels, search/filter inputs, and keyboard-dismissible gift detail dialogs. Decorative imagery is currently represented by emoji and CSS rather than exported watercolor artwork from the original mockup; these can be swapped for dedicated assets later.

The website is not affiliated with any product manufacturers.
