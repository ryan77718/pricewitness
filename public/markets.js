import {providerDirectory} from "../companion/providers.js";

const goods={category:"Retail",minutes:1440,modes:["Pickup","In store","Delivery","Shipping"],basis:"Item price before tax",location:"store",offer:"Product",variant:"Model or pack size, condition and seller"};
const productCode={name:"productCode",label:"UPC or retailer SKU",max:48};
const storefront={name:"marketCountry",label:"Booking storefront country (two-letter code)",type:"country"};
const plans={name:"phase",label:"Price stage",choices:["Standard","Introductory","Renewal","Retention"]};
const profiles={
  retail:goods,
  online:{...goods,modes:["Shipping"],extras:[productCode]},
  marketplace:{...goods,modes:["Shipping"],variant:"Variant, condition, seller and fulfillment company",extras:[productCode]},
  tech:{...goods,category:"Tech",modes:["Shipping","Pickup","In store"],variant:"Configuration, condition, seller and bundle",extras:[productCode]},
  onlinetech:{...goods,category:"Tech",modes:["Shipping"],variant:"Configuration, condition, seller and bundle",extras:[productCode]},
  grocery:{...goods,category:"Groceries",modes:["Pickup","Delivery"],variant:"Brand, size, pack count and quantity",extras:[productCode]},
  ride:{category:"Rides",minutes:15,modes:["On demand"],basis:"Upfront fare before tip",location:"route",offer:"Ride type",variant:"Public route landmarks and service details"},
  meal:{category:"Delivery",minutes:30,modes:["Delivery","Pickup"],basis:"Checkout total before tip",location:"store",offer:"Basket",variant:"Items, sizes, modifiers and quantities"},
  hotel:{category:"Hotels",minutes:30,modes:["One room · cash rate"],basis:"Full stay including taxes and mandatory fees",location:"property",
    offer:"Hotel property name",variant:"Room type, cancellation deadline, meals and payment terms",
    extras:[storefront,{name:"city",label:"Property city and state or country",max:80},{name:"checkIn",label:"Check-in date",type:"date"},{name:"checkOut",label:"Check-out date",type:"date"},{name:"adults",label:"Adults sharing this room (no children)",type:"integer",max:8}]},
  flight:{category:"Flights",minutes:15,modes:["Nonstop one-way · one adult"],basis:"One adult cash fare including taxes and mandatory fees",location:"airports",
    offer:"Marketing flight number (e.g. AA123)",variant:"Cabin, fare brand, baggage allowance and change terms",
    extras:[storefront,{name:"departure",label:"Departure airport (IATA)",type:"airport"},{name:"arrival",label:"Arrival airport (IATA)",type:"airport"},{name:"flyDate",label:"Local departure date",type:"date"}]},
  broadband:{category:"Broadband",minutes:1440,modes:["Home internet"],basis:"Monthly service price before tax, excluding equipment and one-time fees",location:"service",
    offer:"Plan name or broadband label ID",variant:"Down/up speeds, technology, contract and promo duration",extras:[plans]},
  software:{category:"Subscriptions",minutes:1440,modes:["Monthly","Annual paid upfront","Annual billed monthly"],basis:"Charge per billing period before tax",location:"digital",
    offer:"Subscription plan",variant:"Edition, seats, billing channel and offer duration",extras:[plans]}
};
export const markets=Object.fromEntries(Object.entries(providerDirectory).map(([name,[profile,domain]])=>[name,{...profiles[profile],domain}]));

export function usesOrigin(spec) {
  const {location}=markets[spec.provider];
  return ["route","service"].includes(location) || (location==="store" && spec.fulfillment!=="Shipping");
}
export function usesDestination(spec) {
  return markets[spec.provider].location==="route" || ["Delivery","Shipping"].includes(spec.fulfillment);
}
export function needsBranch(spec) {
  return markets[spec.provider].location==="store" && spec.fulfillment!=="Shipping";
}
export function marketLabel(spec) {
  const {location}=markets[spec.provider];
  if(location==="property")return spec.city+" · "+spec.checkIn+" to "+spec.checkOut+" · "+spec.adults+" adult"+(spec.adults==="1"?"":"s")+" · "+spec.marketCountry+" storefront";
  if(location==="airports")return spec.departure+" → "+spec.arrival+" · "+spec.flyDate+" · "+spec.marketCountry+" storefront";
  if(location==="digital")return "US storefront · "+spec.fulfillment+" · "+spec.phase;
  if(location==="service")return "Service ZIP "+spec.originZip+" · "+spec.phase;
  const branch=needsBranch(spec)?spec.branch+" · ":"";
  if(spec.fulfillment==="Shipping")return "Shipped to "+spec.destinationZip;
  return branch+spec.originZip+(usesDestination(spec)?" → "+spec.destinationZip:"")+" · "+spec.fulfillment;
}
export function windowLabel(start, minutes) {
  if (!start) return "";
  const date = new Date(start);
  if (minutes === 1440) return date.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}) + " (UTC day)";
  const options = {hour:"numeric",minute:"2-digit"};
  const end = new Date(date.getTime()+minutes*60000);
  return date.toLocaleDateString(undefined,{month:"short",day:"numeric"}) + " · " +
    date.toLocaleTimeString(undefined,options) + "-" + end.toLocaleTimeString(undefined,{...options,timeZoneName:"short"});
}
