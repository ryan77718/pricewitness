export const categories = [
    "Retail",
    "Groceries",
    "Tech",
    "Broadband",
    "Flights",
    "Hotels",
    "Rides",
    "Delivery",
    "Subscriptions",
    "Other"
];
export const currencies = [
    "USD",
    "EUR",
    "GBP",
    "CAD",
    "AUD",
    "INR",
    "JPY"
];
export function price(value, currency = "USD") {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: Number.isInteger(value / 100) ? 0 : 2,
        maximumFractionDigits: 2
    }).format(value / 100);
}
export function spread(t) {
    const values = t.quotes.map((q)=>q.cents).sort((a, b)=>a - b);
    const low = values[0] ?? 0, high = values[values.length - 1] ?? 0;
    return {
        low,
        high,
        gap: high - low,
        percent: low > 0 ? Math.round((high - low) / low * 100) : null
    };
}
export function dayLabel(date) {
    return new Date(date.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC"
    });
}
