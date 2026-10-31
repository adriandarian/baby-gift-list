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
