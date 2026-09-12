type LogFields = Record<string, unknown>;

function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    const key = k.toLowerCase();
    if (key.includes("token") || key.includes("secret") || key.includes("authorization") || key.includes("password") || key.includes("apikey") || key.includes("api_key")) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function jobLog(event: string, fields: LogFields = {}) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...sanitize(fields) }));
}
