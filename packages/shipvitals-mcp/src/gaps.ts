export const REVIEW_NOTE =
  "These rows are customer reviews from the App Store Connect API. Star counts here are only the rows returned, not the public App Store rating. Apple does not return a lifetime average on this endpoint.";

export const TESTFLIGHT_NOTE =
  "These are TestFlight tester crash and screenshot submissions, not production crash rates. Tester email addresses are not returned.";

export const SALES_NOTES = [
  "Sales reports cover the whole vendor number, not one app. Pass sku to keep rows for a single product. The app id is an entitlement check.",
  "Figures are Apple's units and developer proceeds. This is not MRR. Subscription events are a different reportType.",
  "A 404 usually means Apple has not published that frequency and date yet. Daily reports often lag by a day or two.",
  "The API key needs the Admin, Finance, or Sales role.",
];

export const FINANCE_NOTES = [
  "Finance reports are monthly, for one Apple financial region, for the whole vendor. They are not per app.",
  "regionCode is Apple's financial region (for example US, AU, GB, JP, or EU), not every storefront country.",
  "reportDate is YYYY-MM. Apple publishes these after the fiscal month is processed. A 404 means that region and month are not available.",
  "The API key needs the Admin or Finance role. This call does not return a payout date or an account balance.",
];

export const PERF_GAPS = [
  "App Store Connect has no synchronous crash rate or hang rate query. There is no Play Developer Reporting style threshold to flag.",
  "Hang rate, launch time, memory, and disk writes arrive as Analytics Reports: create a request, wait for Apple, then download a CSV. This tool only lists report requests that already exist. It does not create a request and it does not download the CSV.",
  "TestFlight crash feedback is tester comments, not the production crash rate.",
  "Xcode Organizer is not available through this API.",
];

export const PHASED_RELEASE_NOTE =
  "appStoreState is Apple's version state. A null phasedRelease means that version has no phased release, which is normal.";

export const RESPONSE_BODY_MAX = 5970;
