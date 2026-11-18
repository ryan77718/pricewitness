# PriceWitness

A community price-comparison site for products, travel, rides and subscriptions. Shoppers can publish a single quote, compare two quotes, add sightings to an existing comparison, comment and keep a private watchlist.

## Run locally

On Windows with Node.js 24 or later, double-click `Start-PriceWitness.cmd` to launch the site. From this directory, run `npm start` and open [PriceWitness](http://127.0.0.1:4387/). There are no packages to install. The loopback preview uses one development identity and persists contributions to `.sites-runtime/preview.sqlite`.

## Build and check

Run `npm run build` followed by `npm test`. Tests use an isolated in-memory database. The build creates an ES module Worker under `dist/server` and copies the D1 migration into the deployment artifact. Hosted writes require the site identity supplied by the hosting platform. Bind D1 as `DB` and apply the tracked migration on deployment.

## Comparison model

A comparison matches the retailer, item, variant or itinerary, category, and currency. The price gap equals (highest minus lowest) divided by lowest. The app shows a monetary difference when the lowest price is zero. Account context and fees are supplied by the contributor. Examples are labeled and cannot be mixed with real price sightings.

The application stores a site-specific identity for ownership and private saves. Public rows show the contributor's chosen alias. It does not request retailer credentials or use external analytics scripts.
