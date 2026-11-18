export const categories = [
    "Retail",
    "Flights",
    "Hotels",
    "Rides",
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
const rows = [
    [
        "headphones",
        "Amazon",
        "Retail",
        "Sony WH-1000XM5 headphones",
        "Black · New · Sold by Amazon",
        24999,
        29999,
        "Signed out · Desktop",
        "Prime account · Mobile app"
    ],
    [
        "flight",
        "Delta Air Lines",
        "Flights",
        "New York → Los Angeles",
        "JFK to LAX · DL 527 · Dec 12 · Main Cabin, one way",
        24900,
        31900,
        "Guest checkout · Web",
        "SkyMiles member · App"
    ],
    [
        "ride",
        "Uber",
        "Rides",
        "UberX to Charlotte Douglas Airport",
        "Uptown Charlotte to CLT · UberX · 8:15 AM",
        2840,
        3620,
        "Standard account · iOS",
        "Standard account · Android"
    ],
    [
        "hotel",
        "Booking.com",
        "Hotels",
        "One night at a Chicago hotel",
        "Same king room · Dec 10–11 · Refundable, taxes included",
        18400,
        21800,
        "Member rate · App",
        "Signed out · Web"
    ],
    [
        "coffee",
        "Target",
        "Retail",
        "Nespresso Vertuo Pop+",
        "Black · Machine only · Standard delivery",
        9999,
        12999,
        "Circle member · Web",
        "Signed out · Web"
    ],
    [
        "music",
        "Spotify",
        "Subscriptions",
        "Premium Individual monthly plan",
        "United States · Individual · First month",
        599,
        1199,
        "Returning member offer",
        "Standard monthly offer"
    ],
    [
        "kindle",
        "Amazon",
        "Retail",
        "Kindle Paperwhite, 16 GB",
        "Black · Ad-supported · New · Sold by Amazon",
        13999,
        15999,
        "Member offer · Web",
        "Signed out · Web"
    ],
    [
        "charger",
        "Amazon",
        "Retail",
        "Anker Nano 30W USB-C charger",
        "One port · White · Sold by AnkerDirect",
        1599,
        1999,
        "Coupon applied · Web",
        "Regular price · App"
    ],
    [
        "flight2",
        "Delta Air Lines",
        "Flights",
        "Atlanta → Boston",
        "ATL to BOS · DL 742 · Dec 14 · Main Cabin, one way",
        19800,
        23800,
        "Guest checkout · Web",
        "Member search · Web"
    ],
    [
        "target",
        "Target",
        "Retail",
        "Logitech Pebble Mouse 2 M350s",
        "Graphite · New · Standard delivery",
        2199,
        2999,
        "Circle offer · App",
        "Signed out · Web"
    ],
    [
        "uber2",
        "Uber",
        "Rides",
        "UberX from Union Station",
        "Chicago Union Station to Navy Pier · UberX · 4:00 PM",
        1840,
        2310,
        "Standard account · Web",
        "Standard account · App"
    ]
];
export const examples = rows.map(([id, merchant, category, title, variant, a, b, ca, cb], i)=>{
    const created = new Date(Date.UTC(2026, 10, 17, 18 - i)).toISOString();
    const quote = (cents, context, n)=>({
            id: id + "-" + n,
            cents,
            context,
            seen: created.slice(0, 10),
            alias: "Example shopper " + n
        });
    return {
        id: "example-" + id,
        merchant,
        category,
        title,
        variant,
        created,
        currency: "USD",
        examples: true,
        quotes: [
            quote(a, ca, 1),
            quote(b, cb, 2)
        ],
        comments: [],
        votes: 0,
        liked: false,
        saved: false
    };
});
