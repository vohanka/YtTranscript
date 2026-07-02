// Optional: deploy this if the public CORS proxies get flaky.
// It's free, serverless, and takes ~2 minutes.
//
// Deploy (no install needed):
//   1. https://dash.cloudflare.com  ->  Workers & Pages  ->  Create  ->  Worker
//   2. Replace the default code with this file, click Deploy.
//   3. Copy the URL, e.g. https://yt-proxy.YOURNAME.workers.dev
//   4. In the app's Settings, pick "Vlastní Cloudflare Worker" and paste:
//        https://yt-proxy.YOURNAME.workers.dev/?url=
//
// Optional hardening: restrict ALLOW_ORIGIN to your GitHub Pages origin
// and only allow youtube.com targets (both shown below, commented).

export default {
  async fetch(request) {
    const ALLOW_ORIGIN = "*"; // e.g. "https://YOURNAME.github.io"

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors(ALLOW_ORIGIN) });
    }

    const target = new URL(request.url).searchParams.get("url");
    if (!target) {
      return json({ error: "missing ?url=" }, 400, ALLOW_ORIGIN);
    }

    // Optional: only proxy YouTube to avoid becoming an open relay.
    // if (!/^https:\/\/(www\.)?youtube\.com\//.test(target)) {
    //   return json({ error: "blocked target" }, 403, ALLOW_ORIGIN);
    // }

    try {
      const upstream = await fetch(target, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "accept-language": "cs-CZ,cs;q=0.9,en;q=0.8",
        },
        redirect: "follow",
      });

      const body = await upstream.arrayBuffer();
      const headers = cors(ALLOW_ORIGIN);
      headers.set(
        "content-type",
        upstream.headers.get("content-type") || "text/plain; charset=utf-8"
      );
      return new Response(body, { status: upstream.status, headers });
    } catch (e) {
      return json({ error: String(e) }, 502, ALLOW_ORIGIN);
    }
  },
};

function cors(origin) {
  const h = new Headers();
  h.set("access-control-allow-origin", origin);
  h.set("access-control-allow-methods", "GET, OPTIONS");
  h.set("access-control-allow-headers", "*");
  return h;
}

function json(obj, status, origin) {
  const h = cors(origin);
  h.set("content-type", "application/json");
  return new Response(JSON.stringify(obj), { status, headers: h });
}
