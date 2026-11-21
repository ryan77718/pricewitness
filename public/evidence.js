// Shared by the website forms and the Worker. Keep this file free of browser-only APIs.
// Each answer is optional. An empty value means the shopper did not check or did not say.
export const noticeOptions = [
  ["", "Didn't check"],
  ["none", "Looked: no notice"],
  ["near-price", "Notice next to the price"],
  ["behind-link", "Notice behind a link or in fine print"],
  ["elsewhere", "Notice somewhere else on the page"]
];
export const noticeShown = ["near-price", "behind-link", "elsewhere"];
export const setupQuestions = [
  {name:"signedIn", label:"Signed in?", options:[["yes","Signed in"],["no","Signed out or guest"]]},
  {name:"member", label:"Member or loyalty account?", options:[["yes","Member"],["no","Not a member"]]},
  {name:"device", label:"Device", options:[["phone","Phone"],["tablet","Tablet"],["computer","Computer"]]},
  {name:"surface", label:"App or website?", options:[["app","Company app"],["website","Website"]]},
  {name:"place", label:"Where were you?", options:[["home","At home"],["store","In or near the store"],["elsewhere","Somewhere else"]]},
  {name:"viewedBefore", label:"Seen this item before?", options:[["yes","Viewed or carted before"],["no","First look"]]}
];
export const shopperStates = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
export const evidenceTierLabels = ["Typed report", "Screenshot fingerprint", "Page capture"];

// A price check code groups reports from one organized test, e.g. "clt-grocery-1".
// Returns "" for no code and null for a code that is not allowed.
export function testCode(value) {
  if (value == null || value === "") return "";
  const code = String(value).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(code) ? code : null;
}
export function optionLabel(options, value) {
  return options.find(([key]) => key === value)?.[1] || "";
}
