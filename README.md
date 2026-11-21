# PriceWitness

A community price-comparison site for products, travel, rides and subscriptions. Shoppers can publish a single quote, compare two quotes, add sightings to an existing comparison, comment and keep a private watchlist.

The explorer opens with the newest comparison that has at least two sightings. The arrows browse up to four offers, with labeled examples filling any empty places. Select a price tag, bar, or dot to inspect the underlying reports. **Low & high** shows dates and conditions side by side.

Drag the price marker or enter a quote to compare it with the median and see how many sightings were cheaper. For grouped prices the checker gives a lower bound whenever the exact count is uncertain. The quote stays on the device. Each chart uses at most 16 price groups and requests individual sightings one page at a time.

## Run locally

On Windows with Node.js 24 or later, double-click `Start-PriceWitness.cmd` to launch the site. From this directory, run `npm start` and open [PriceWitness](http://127.0.0.1:4387/). There are no packages to install. The loopback preview uses one development identity and persists contributions to `.sites-runtime/preview.sqlite`.

## Build and check

Run `npm run build` followed by `npm test`. The running local preview picks up the rebuilt Worker on the next request. Tests use an isolated in-memory database. The build creates an ES module Worker under `dist/server` and copies the D1 migrations into the deployment artifact. Hosted writes require the site identity supplied by the hosting platform. Bind D1 as `DB` and apply the tracked migrations on deployment.

## Comparison model

### Connected local prices

Open **App feeds** to find 45 supported providers across nine sectors. Browse a sector or search across the directory and choose an offer to report or connect. See [the feed research and launch priorities](docs/price-feed-research.md). The Chrome / Edge companion runs on the provider's website after the shopper pairs it and clicks a visible USD price. It sends changes for up to 15 minutes while the tab is visible. Sharing ends when the page navigates, the selected price disappears, the timer expires or the shopper stops it. The companion is supplied as an unpacked extension for this preview.

Compatible apps and shortcuts can use the same connection by sending JSON to `POST /api/price-events` with a scoped bearer token. Each event carries a unique `eventId`, a UTC `observedAt` timestamp and integer `cents`. The connection code is shown once. Disconnecting it revokes future access. The site stores its hash. These are shopper-authorized contributions. Merchant sign-in and provider-issued OAuth connections are outside this build.

The installable web app accepts shared links or text from the Android share sheet on supporting browsers. It extracts a recognized provider and an unambiguous amount, then opens an editable draft. The shopper reviews the offer, location and price before publishing.

All observations use USD. Travel forms use storefront country, airports or property location and travel dates. Groceries and electronics match UPC or SKU plus offer details. Broadband uses service ZIP, and subscriptions match billing term and price stage. Local physical offers use US ZIP codes. Ride comparisons include the directed route and ride type in 15-minute windows. Delivery comparisons match the branch, basket, fulfillment and, for delivery, the destination in 30-minute windows. Retail comparisons match the seller, item variant, fulfillment and store or shipping area within a UTC day. Each shopper contributes their latest quote per comparison. Visible comparisons check for updates every 15 seconds. Search accepts ZIP codes, branch names and product codes. From any local comparison, **Connect this offer** reuses its exact terms.

A comparison matches the retailer, item, variant or itinerary, category, and currency. The price gap equals (highest minus lowest) divided by lowest. The app shows a monetary difference when the lowest price is zero. Account context and fees are supplied by the contributor. Examples are labeled and cannot be mixed with real price sightings.

The application stores a site-specific identity for ownership and private saves. Public rows show the contributor's chosen alias. It does not request retailer credentials or use external analytics scripts.

### Evidence, privacy and price checks

The public [methods page](public/methods.html) (`/methods`) explains matching, every stored field, evidence levels, fingerprints, privacy rules and the limits of the data in plain language. Keep it in step with the code.

Every sighting can carry optional evidence: the crossed-out "was" price, checkout fees and total, position in search results, whether the page showed a personalized-price notice (and its wording), the shopper's setup (signed in, member, device, app or website, where they were, seen before) and their state. The option lists live in `public/evidence.js` and are shared by the forms and the Worker. Setup answers and state are never shown one report at a time; totals appear once three different shoppers report the same offer. Other people see sighting times rounded to the hour.

Each stored sighting gets a SHA-256 record fingerprint (recipe in `worker/evidence.js` and on the methods page) that is appended to a public daily list at `GET /api/ledger` (`?day=YYYY-MM-DD&format=text` for the plain list; its SHA-256 is the day's root). Screenshots are fingerprinted in the shopper's browser and never uploaded. The browser companion fingerprints the page text around the selected price and keeps that text in the extension's local storage, where the shopper can download it.

To stamp a completed day's list with two RFC 3161 timestamp services, run `node scripts/stamp-ledger.mjs https://your-site.example [YYYY-MM-DD]`; it writes `ledger/<day>.txt` and `.tsr` receipts to commit. Add `--no-stamp` to save the list without contacting the services.

A price check code (for example `clt-grocery-1`) groups reports from one organized test into their own comparisons, with no clock windows. Volunteers can open `/?test=clt-grocery-1` to have the code filled in. Connected feeds take the code when they are created.

## Status

PriceWitness is an early prototype. It runs locally and has no public users yet. Sign-in currently relies on the identity supplied by the hosting platform, and the browser companion is loaded as an unpacked extension. Expect things to change.

## Contact

For questions, press, funding and partnerships, email [price_witness@outlook.com](mailto:price_witness@outlook.com).

## Reporting a security or privacy problem

Please do not open a public issue for a security or privacy problem. See [SECURITY.md](SECURITY.md) for how to report one privately.

## License

The code is released under the [MIT License](LICENSE). Company and product names appear only to identify the offers shoppers report. Example comparisons in the app are illustrative and are not real price observations.
