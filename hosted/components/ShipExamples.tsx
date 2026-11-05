type Example = {
  title: string;
  prompt: string;
  tool: string;
  args: string;
  json: string;
  answer: string[];
};

const examples: Example[] = [
  {
    title: "Recent 2 star reviews",
    prompt: "Any recent 2 star App Store reviews for the iOS app? Do not reply yet.",
    tool: "list_reviews",
    args: '{ "appId": "1234567890", "rating": 2 }',
    json: `{
  "appId": "1234567890",
  "reviews": [
    { "id": "rev-1", "rating": 2, "title": "Crashes on launch",
      "body": "Build 42 dies on the home screen.",
      "reviewerNickname": "Alex", "territory": "AUS", "hasResponse": false }
  ],
  "fetchedAverage": 2,
  "note": "These rows are customer reviews. Star counts here are only the rows returned, not the public App Store rating."
}`,
    answer: [
      "One 2 star review from Australia: launch crash on build 42, no public reply yet.",
      "That average is this page only. It is not the App Store rating.",
    ],
  },
  {
    title: "Version state",
    prompt: "Is 1.4.0 on sale, and is a phased release still running?",
    tool: "get_app_status",
    args: '{ "appId": "1234567890" }',
    json: `{
  "id": "1234567890",
  "bundleId": "com.example.ios",
  "versions": [
    { "versionString": "1.4.0", "platform": "IOS", "appStoreState": "READY_FOR_SALE",
      "phasedRelease": { "state": "COMPLETE", "currentDayNumber": 7 } }
  ],
  "note": "A null phasedRelease means that version has no phased release, which is normal."
}`,
    answer: [
      "1.4.0 is Ready for Sale on iOS. The phased release has finished (day 7, complete).",
    ],
  },
  {
    title: "No live crash rate",
    prompt: "What is the production crash rate this week?",
    tool: "get_perf_summary",
    args: '{ "appId": "1234567890" }',
    json: `{
  "appId": "1234567890",
  "requests": [
    { "id": "report-request-1", "accessType": "ONGOING",
      "reports": [ { "name": "Performance", "category": "PERFORMANCE" } ] }
  ],
  "gaps": [
    "App Store Connect has no synchronous crash rate or hang rate query."
  ],
  "fixture": null,
  "note": "Report names are a catalogue. They are not crash or hang rates."
}`,
    answer: [
      "There is no crash rate to quote. Apple has an ongoing Performance report request, which is a CSV they generate, not a live percentage.",
      "TestFlight comments and Xcode Organizer are separate, and neither is a production rate from this call.",
    ],
  },
];

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function highlight(json: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of json.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(json.slice(last, at));
    if (m[1] && m[2]) {
      out.push(
        <span key={i++} className="tk-key">
          {m[1]}
        </span>,
        m[2],
      );
    } else if (m[1]) {
      out.push(
        <span key={i++} className="tk-str">
          {m[1]}
        </span>,
      );
    } else if (m[3]) {
      out.push(
        <span key={i++} className="tk-lit">
          {m[3]}
        </span>,
      );
    } else {
      out.push(
        <span key={i++} className="tk-num">
          {m[4]}
        </span>,
      );
    }
    last = at + m[0].length;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

export function ShipExamples() {
  return (
    <div className="examples">
      {examples.map((ex) => (
        <figure className="embed" key={ex.title}>
          <span className="embed-tab">Example output</span>
          <div className="embed-bar">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="embed-title">claude / {ex.tool}</span>
          </div>
          <div className="embed-body">
            <pre className="code">
              <span className="tk-cmt"># {ex.title}</span>
              {"\n"}
              <span className="tk-prompt">&gt; </span>
              <span className="tk-you">{ex.prompt}</span>
              {"\n\n"}
              <span className="tk-cmt">{"// tool call"}</span>
              {"\n"}
              <span className="tk-fn">{ex.tool}</span>
              {"("}
              {highlight(ex.args)}
              {")"}
              {"\n\n"}
              <span className="tk-cmt">{"// response"}</span>
              {"\n"}
              {highlight(ex.json)}
              {"\n\n"}
              <span className="tk-cmt">{"// assistant"}</span>
              {"\n"}
              <span className="tk-out">{ex.answer.join("\n")}</span>
            </pre>
          </div>
        </figure>
      ))}
      <p className="muted small">
        Made-up app and data, to show the shape of what comes back. Live perf calls leave fixture null and do not invent a crash rate.
      </p>
    </div>
  );
}
