const rows = [
    [
        "headphones",
        "Example Marketplace",
        "Retail",
        "Wireless noise-cancelling headphones",
        "Black · New · Sold by the marketplace",
        24999,
        29999,
        "Signed out · Desktop",
        "Paid member account · Mobile app"
    ],
    [
        "flight",
        "Example Airways",
        "Flights",
        "New York → Los Angeles",
        "JFK to LAX · Flight 527 · Dec 12 · Economy, one way",
        24900,
        31900,
        "Guest checkout · Web",
        "Loyalty member · App"
    ],
    [
        "ride",
        "Example Rides",
        "Rides",
        "Standard ride to Charlotte Douglas Airport",
        "Uptown Charlotte to CLT · Standard · 8:15 AM",
        2840,
        3620,
        "Standard account · iOS",
        "Standard account · Android"
    ],
    [
        "hotel",
        "Example Stays",
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
        "Example Mart",
        "Retail",
        "Single-serve coffee maker",
        "Black · Machine only · Standard delivery",
        9999,
        12999,
        "Rewards member · Web",
        "Signed out · Web"
    ],
    [
        "music",
        "Example Music",
        "Subscriptions",
        "Individual monthly plan",
        "United States · Individual · First month",
        599,
        1199,
        "Returning member offer",
        "Standard monthly offer"
    ],
    [
        "ereader",
        "Example Marketplace",
        "Retail",
        "E-reader, 16 GB",
        "Black · Ad-supported · New · Sold by the marketplace",
        13999,
        15999,
        "Member offer · Web",
        "Signed out · Web"
    ],
    [
        "charger",
        "Example Marketplace",
        "Retail",
        "30W USB-C charger",
        "One port · White · Sold by the maker",
        1599,
        1999,
        "Coupon applied · Web",
        "Regular price · App"
    ],
    [
        "flight2",
        "Example Airways",
        "Flights",
        "Atlanta → Boston",
        "ATL to BOS · Flight 742 · Dec 14 · Economy, one way",
        19800,
        23800,
        "Guest checkout · Web",
        "Member search · Web"
    ],
    [
        "mouse",
        "Example Mart",
        "Retail",
        "Wireless mouse",
        "Graphite · New · Standard delivery",
        2199,
        2999,
        "Rewards offer · App",
        "Signed out · Web"
    ],
    [
        "ride2",
        "Example Rides",
        "Rides",
        "Standard ride from Union Station",
        "Chicago Union Station to Navy Pier · Standard · 4:00 PM",
        1840,
        2310,
        "Standard account · Web",
        "Standard account · App"
    ]
];
function exampleQuotes(id, low, high, contextLow, contextHigh, created) {
    const quote = (cents, context, index) => ({
        id: id + "-" + index,
        cents, context, seen: created.slice(0, 10), alias: "Example shopper " + index
    });
    if (id !== "headphones") return [quote(low,contextLow,1), quote(high,contextHigh,2)];
    // A fixed, clearly labeled teaching dataset. These are never mixed with shopper reports.
    const quantities = [2,1,3,4,6,9,12,15,17,14,10,7,5,4,2,1];
    const contexts = ["Signed out · Desktop", "Signed in · Mobile app", "Member offer · Web", "Signed in · Desktop"];
    const reports = [];
    quantities.forEach((n,band) => {
        const amount = low + Math.round((high-low)*band/(quantities.length-1)/100)*100;
        for (let i=0;i<n;i++) reports.push(quote(amount,contexts[(i+band)%contexts.length],reports.length+1));
    });
    return reports;
}

const examples = rows.map(([id, merchant, category, title, variant, low, high, ca, cb], i) => {
    const created = new Date(Date.UTC(2026, 10, 17, 18-i)).toISOString();
    return {
        id:"example-"+id, merchant, category, title, variant, created, currency:"USD", examples:true,
        quotes: exampleQuotes(id,low,high,ca,cb,created),
        comments:[], votes:0, liked:false, saved:false
    };
});
