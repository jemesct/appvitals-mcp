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
    title: "Recent 1 star reviews",
    prompt: "Any 1 star reviews for Habit Jar this week? What are people angry about?",
    tool: "get_recent_reviews",
    args: '{ "packageName": "com.example.habitjar", "maxStars": 1 }',
    json: `{
  "packageName": "com.example.habitjar",
  "reviews": [
    { "reviewId": "gp:AOqp...x1", "authorName": "Mel K", "starRating": 1,
      "text": "Streak reset overnight after the update. 140 days gone.",
      "lastModified": "2026-11-03T21:14:09Z" },
    { "reviewId": "gp:AOqp...x2", "authorName": "Dan", "starRating": 1,
      "text": "Reminders stopped working on my Pixel 8.",
      "lastModified": "2026-11-02T08:40:51Z" },
    { "reviewId": "gp:AOqp...x3", "authorName": "Priya S", "starRating": 1,
      "text": "Lost my streak too. Please fix.",
      "lastModified": "2026-11-01T11:02:33Z" }
  ],
  "note": "Google only returns reviews created or modified in the last 7 days."
}`,
    answer: [
      "3 one star reviews in the last 7 days. Two themes:",
      "1. Streaks reset after 2.3.0 (2 reviews). Looks like a migration bug.",
      "2. Reminders not firing on Pixel 8 (1 review). Check exact alarm permissions on Android 14.",
    ],
  },
  {
    title: "Crash and ANR vs Play thresholds",
    prompt: "Is Habit Jar over Play's bad behaviour thresholds for crashes or ANRs?",
    tool: "get_vitals",
    args: '{ "packageName": "com.example.habitjar", "days": 7 }',
    json: `{
  "packageName": "com.example.habitjar",
  "days": 7,
  "series": [
    { "date": "2026-10-29", "userPerceivedCrashRate": 0.0062, "userPerceivedAnrRate": 0.0021, "distinctUsers": 18420 },
    { "date": "2026-11-01", "userPerceivedCrashRate": 0.0131, "userPerceivedAnrRate": 0.0024, "distinctUsers": 19105 },
    { "date": "2026-11-02", "userPerceivedCrashRate": 0.0118, "userPerceivedAnrRate": 0.0026, "distinctUsers": 18877 }
  ],
  "flags": [
    { "metric": "userPerceivedCrashRate", "date": "2026-11-01", "value": 0.0131, "threshold": 0.0109 },
    { "metric": "userPerceivedCrashRate", "date": "2026-11-02", "value": 0.0118, "threshold": 0.0109 }
  ],
  "notes": ["Rates are fractions. 0.0109 means 1.09%."]
}`,
    answer: [
      "Metric                     Latest  Threshold  Status",
      "User-perceived crash rate  1.18%   1.09%      OVER on 2 days",
      "User-perceived ANR rate    0.26%   0.47%      OK",
    ],
  },
  {
    title: "Rating trend over 30 days",
    prompt: "How has Habit Jar's star rating moved over the last 30 days?",
    tool: "get_review_history",
    args: '{ "packageName": "com.example.habitjar", "since": "2026-10-06T00:00:00Z" }',
    json: `{
  "packageName": "com.example.habitjar",
  "reviews": [ "... 212 stored reviews ..." ],
  "note": "These rows come from hosted snapshots, so they can outlive the 7 day Play API window."
}`,
    answer: [
      "Week             Reviews  Avg stars",
      "6 to 12 Oct      48       4.5",
      "13 to 19 Oct     51       4.4",
      "20 to 26 Oct     55       4.4",
      "27 Oct to 2 Nov  58       3.9",
      "Steady around 4.4 until 2.3.0, then a drop to 3.9, mostly from streak reset reports.",
    ],
  },
  {
    title: "Release and rollout status",
    prompt: "What's live on production and how far is the rollout?",
    tool: "list_releases",
    args: '{ "packageName": "com.example.habitjar" }',
    json: `{
  "packageName": "com.example.habitjar",
  "tracks": [
    { "track": "production", "releases": [
      { "name": "2.3.0", "status": "inProgress", "versionCodes": [230], "userFraction": 0.2 },
      { "name": "2.2.4", "status": "completed", "versionCodes": [224], "userFraction": null }
    ] },
    { "track": "internal", "releases": [
      { "name": "2.3.1", "status": "completed", "versionCodes": [231], "userFraction": null }
    ] }
  ],
  "editDeleted": true
}`,
    answer: [
      "Production: 2.3.0 is rolling out to 20% of users. Everyone else is on 2.2.4.",
      "Internal: 2.3.1 is ready. Given the crash flags, you might halt 2.3.0 at 20% and push 2.3.1.",
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
      out.push(<span key={i++} className="tk-key">{m[1]}</span>, m[2]);
    } else if (m[1]) {
      out.push(<span key={i++} className="tk-str">{m[1]}</span>);
    } else if (m[3]) {
      out.push(<span key={i++} className="tk-lit">{m[3]}</span>);
    } else {
      out.push(<span key={i++} className="tk-num">{m[4]}</span>);
    }
    last = at + m[0].length;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

export function Examples() {
  return (
    <div className="examples">
      {examples.map((ex) => (
        <figure className="embed" key={ex.tool}>
          <span className="embed-tab">Example output</span>
          <div className="embed-bar">
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
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
        Made-up app and data, to show the shape of what comes back. Your own numbers come straight from the Play Developer API.
      </p>
    </div>
  );
}
