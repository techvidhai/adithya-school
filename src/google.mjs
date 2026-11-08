const tokenEndpoint = "https://oauth2.googleapis.com/token";
let session;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function exchange(email, privateKey) {
  const encoder = new TextEncoder();
  const encode = value => base64url(encoder.encode(JSON.stringify(value)));
  const now = Math.floor(Date.now() / 1000);
  const claims = encode({
    iss: email,
    aud: tokenEndpoint,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
    iat: now,
    exp: now + 3600
  });
  const message = encode({ alg: "RS256", typ: "JWT" }) + "." + claims;
  const pem = privateKey.replaceAll("\\n", "\n").replace(/-----[^-]+-----|\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(pem), char => char.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(message));
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: message + "." + base64url(new Uint8Array(signature))
    })
  });
  if (!response.ok) throw new Error("Google OAuth failed: " + response.status);
  const token = await response.json();
  if (!token.access_token || !Number.isFinite(token.expires_in)) throw new Error("Invalid Google OAuth response");
  return { accessToken: token.access_token, expires: Date.now() + token.expires_in * 1000 };
}

async function accessToken(env) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error("Google credentials are missing");
  if (session?.email === email && session.key === key && session.expires > Date.now() + 60000) {
    return session.accessToken;
  }
  session = { email, key, ...await exchange(email, key) };
  return session.accessToken;
}

export async function googleGet(url, env) {
  const token = await accessToken(env);
  return fetch(url, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
}

function rows(range, columns) {
  const [header = [], ...entries] = range?.values ?? [];
  const names = header.map(value => String(value).trim());
  if (columns.some(name => names.filter(value => value === name).length !== 1)) {
    throw new Error("A CMS tab is missing required headers or has duplicate headers");
  }
  return entries.map(entry => Object.fromEntries(
    columns.map(name => [name, String(entry[names.indexOf(name)] ?? "").trim()])
  ));
}

export async function readContent(env) {
  const id = env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error("Google spreadsheet ID is missing");
  const url = new URL("https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id) + "/values:batchGet");
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  for (const range of ["SITE!A:B", "FACULTY_MASTER!A:M", "GALLERY!A:E"]) {
    url.searchParams.append("ranges", range);
  }
  const response = await googleGet(url, env);
  if (!response.ok) throw new Error("Google Sheets failed: " + response.status);
  const { valueRanges } = await response.json();
  const [site, faculty, gallery] = valueRanges;
  return {
    site: Object.fromEntries(rows(site, ["Key", "Value"]).map(row => [row.Key, row.Value])),
    faculty: rows(faculty, ["Faculty ID", "Name", "Designation", "Department", "Qualification",
      "Experience", "Specialization", "Subjects", "Awards", "Biography", "Photo File ID", "Status", "Published"]),
    gallery: rows(gallery, ["Image ID", "Title", "Description", "Drive File ID", "Published"])
  };
}
