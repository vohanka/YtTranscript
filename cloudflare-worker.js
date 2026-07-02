"use strict";

// ---------- CORS proxies (no backend of your own) ----------
// Each returns a URL that wraps the target and adds CORS headers.
// They're tried in order until one returns usable content.
const PROXIES = {
  allorigins: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  corsproxy: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  codetabs: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
};
const PROXY_ORDER = ["allorigins", "corsproxy", "codetabs"];

const store = {
  get proxy() {
    return localStorage.getItem("proxy") || "allorigins";
  },
  set proxy(v) {
    localStorage.setItem("proxy", v);
  },
  get worker() {
    return localStorage.getItem("worker") || "";
  },
  set worker(v) {
    localStorage.setItem("worker", v);
  },
  get prompt() {
    return localStorage.getItem("prompt") || "";
  },
  set prompt(v) {
    localStorage.setItem("prompt", v);
  },
};

const DEFAULT_PROMPT = `Shrň mi česky následující přepis YouTube videa "{title}".

1. TL;DR ve 2–3 větách.
2. Klíčové body (5–8 odrážek).
3. Verdikt: stojí za to sledovat celé video? Pro koho ano a proč, případně které pasáže přeskočit.

Přepis:`;

let current = null; // { videoId, title, author, language, segments }

const $ = (s) => document.querySelector(s);

// ---------- helpers ----------
function getVideoId(input) {
  input = (input || "").trim();
  // bare 11-char id
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") return u.pathname.slice(1, 12);
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch (_) {}
  const m = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function fmtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

// Balanced-brace JSON extractor — ytInitialPlayerResponse has nested braces
// that a regex can't safely capture.
function extractJsonAfter(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) return null;
  let i = text.indexOf("{", start);
  if (i === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return text.slice(i, j + 1); }
    }
  }
  return null;
}

// Build the ordered list of proxy fns to try: chosen first, then the rest,
// then a custom Cloudflare Worker if configured.
function proxyChain() {
  const chain = [];
  const chosen = store.proxy;
  if (chosen === "worker" && store.worker) {
    chain.push((u) => store.worker + encodeURIComponent(u));
  } else if (PROXIES[chosen]) {
    chain.push(PROXIES[chosen]);
  }
  for (const id of PROXY_ORDER) {
    if (id !== chosen && PROXIES[id]) chain.push(PROXIES[id]);
  }
  if (chosen !== "worker" && store.worker) {
    chain.push((u) => store.worker + encodeURIComponent(u));
  }
  return chain;
}

async function fetchViaProxy(targetUrl, expect) {
  let lastErr;
  for (const make of proxyChain()) {
    try {
      const res = await fetch(make(targetUrl), { redirect: "follow" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (expect === "html" && !text.includes("ytInitialPlayerResponse")) {
        throw new Error("Proxy nevrátila kompletní stránku.");
      }
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    "Žádná proxy neprošla (" + (lastErr?.message || "?") +
    "). Zkus jinou proxy v Nastavení nebo nasaď vlastní Worker."
  );
}

function pickTrack(tracks, preferred) {
  for (const lang of preferred) {
    const hit = tracks.find((t) => (t.languageCode || "").startsWith(lang));
    if (hit) return hit;
  }
  return tracks[0];
}

async function loadTranscript(videoId, preferred) {
  const html = await fetchViaProxy(
    `https://www.youtube.com/watch?v=${videoId}&hl=en`,
    "html"
  );
  const raw = extractJsonAfter(html, "ytInitialPlayerResponse");
  if (!raw) throw new Error("Nepodařilo se přečíst data přehrávače.");
  const player = JSON.parse(raw);

  const details = player.videoDetails || {};
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || !tracks.length) {
    throw new Error("Video nemá titulky (žádné captionTracks).");
  }

  const track = pickTrack(tracks, preferred);
  const capUrl = track.baseUrl + "&fmt=json3";
  const capText = await fetchViaProxy(capUrl, "json");
  const data = JSON.parse(capText);

  const segments = (data.events || [])
    .filter((e) => e.segs)
    .map((e) => ({
      start: (e.tStartMs || 0) / 1000,
      text: e.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim(),
    }))
    .filter((s) => s.text.length);

  return {
    videoId,
    title: details.title || "(bez názvu)",
    author: details.author || "",
    language: track.languageCode,
    segments,
  };
}

// ---------- rendering ----------
function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function highlight(text, q) {
  if (!q) return escapeHtml(text);
  const esc = escapeHtml(text);
  const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
  return esc.replace(re, "<mark>$1</mark>");
}

function render() {
  if (!current) return;
  const q = $("#search-input").value.trim();
  const withTime = $("#with-time").checked;
  const wrap = $("#transcript");
  wrap.classList.toggle("plain", !withTime);

  const visible = current.segments.filter(
    (s) => !q || s.text.toLowerCase().includes(q.toLowerCase())
  );

  wrap.innerHTML = visible
    .map((s) => {
      const t = withTime
        ? `<button class="t" data-t="${s.start}">${fmtTime(s.start)}</button>`
        : "";
      return `<div class="seg">${t}<span class="text">${highlight(s.text, q)}</span></div>`;
    })
    .join("");

  wrap.querySelectorAll(".t").forEach((b) => {
    b.addEventListener("click", () => openAt(parseFloat(b.dataset.t)));
  });
}

// Open the video at a timestamp — on mobile this deep-links into the YouTube app.
function openAt(seconds) {
  const t = Math.floor(seconds);
  window.open(
    `https://www.youtube.com/watch?v=${current.videoId}&t=${t}s`,
    "_blank",
    "noopener"
  );
}

function plainText(withTime) {
  return current.segments
    .map((s) => (withTime ? `[${fmtTime(s.start)}] ${s.text}` : s.text))
    .join(withTime ? "\n" : " ");
}

// prompt + plain transcript, ready to paste into any AI chat
function aiPayload() {
  const tpl = (store.prompt || DEFAULT_PROMPT).trim();
  return tpl.replace(/\{title\}/g, current.title) + "\n\n" + plainText(false);
}

// find a video ID anywhere in shared text (Android share sheet sends
// "Title https://youtu.be/..." in the text param)
function firstYouTubeId(text) {
  if (!text) return null;
  const direct = getVideoId(text);
  if (direct) return direct;
  for (const u of text.match(/https?:\/\/\S+/g) || []) {
    const id = getVideoId(u);
    if (id) return id;
  }
  return null;
}

// ---------- status ----------
function status(msg, { error = false, loading = false } = {}) {
  const el = $("#status");
  el.className = "status" + (error ? " error" : "");
  el.innerHTML = (loading ? '<span class="spinner"></span>' : "") + (msg || "");
}

// ---------- main action ----------
async function run() {
  const id = getVideoId($("#url-input").value);
  if (!id) {
    status("Vlož platný odkaz na YouTube video.", { error: true });
    return;
  }
  const preferred = $("#lang-input").value.split(",");
  $("#load-btn").disabled = true;
  status("Načítám přepis…", { loading: true });
  toggleResult(false);

  try {
    current = await loadTranscript(id, preferred);
    $("#meta-title").textContent = current.title;
    $("#chip-lang").textContent = current.language;
    $("#chip-count").textContent = current.segments.length + " segmentů";
    const author = $("#chip-author");
    author.textContent = current.author;
    author.style.display = current.author ? "" : "none";
    status("");
    toggleResult(true);
    render();
  } catch (e) {
    status(e.message, { error: true });
    current = null;
  } finally {
    $("#load-btn").disabled = false;
  }
}

function toggleResult(show) {
  $("#meta").classList.toggle("show", show);
  $("#controls").classList.toggle("show", show);
  $("#transcript").classList.toggle("show", show);
  $("#actions").classList.toggle("show", show);
  $("#empty").classList.toggle("hide", show);
}

// ---------- wiring ----------
window.addEventListener("DOMContentLoaded", () => {
  $("#load-btn").addEventListener("click", run);
  $("#url-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });

  $("#paste-btn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      $("#url-input").value = text.trim();
      run();
    } catch (_) {
      status("Schránku nelze přečíst — vlož odkaz ručně.", { error: true });
    }
  });

  $("#search-input").addEventListener("input", render);
  $("#with-time").addEventListener("change", render);

  $("#ai-copy-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(aiPayload());
      status(
        'Zkopírováno i s promptem — otevři ' +
          '<a href="https://claude.ai/new" target="_blank" rel="noopener">Claude</a>' +
          ' nebo <a href="https://chatgpt.com" target="_blank" rel="noopener">ChatGPT</a>' +
          " a vlož."
      );
    } catch (_) {
      status("Kopírování selhalo.", { error: true });
    }
  });

  $("#share-btn").addEventListener("click", async () => {
    const text = aiPayload();
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch (_) {
        /* uživatel zavřel share sheet */
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        status("Sdílení tu není podporováno — zkopírováno do schránky.");
      } catch (_) {
        status("Kopírování selhalo.", { error: true });
      }
    }
  });

  $("#copy-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(plainText($("#with-time").checked));
      status("Zkopírováno do schránky.");
    } catch (_) {
      status("Kopírování selhalo.", { error: true });
    }
  });

  $("#download-btn").addEventListener("click", () => {
    const blob = new Blob([plainText($("#with-time").checked)], {
      type: "text/plain;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      current.title.replace(/[^\w\u00C0-\u017F -]/g, "_").slice(0, 80) + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // settings
  const proxySel = $("#proxy-select");
  const workerInput = $("#worker-input");
  proxySel.value = store.proxy;
  workerInput.value = store.worker;
  $("#worker-wrap").style.display = store.proxy === "worker" ? "" : "none";
  proxySel.addEventListener("change", () => {
    store.proxy = proxySel.value;
    $("#worker-wrap").style.display = proxySel.value === "worker" ? "" : "none";
  });
  workerInput.addEventListener("change", () => {
    store.worker = workerInput.value.trim();
  });

  const promptInput = $("#prompt-input");
  promptInput.value = store.prompt || DEFAULT_PROMPT;
  promptInput.addEventListener("change", () => {
    store.prompt = promptInput.value.trim();
  });

  // pre-fill from ?v= deep links AND from Android share-target params
  // (share_target v manifestu sem doručí ?title=&text=&url=)
  const p = new URLSearchParams(location.search);
  const sharedId = firstYouTubeId(
    [p.get("v"), p.get("url"), p.get("text"), p.get("title")]
      .filter(Boolean)
      .join(" ")
  );
  if (sharedId) {
    $("#url-input").value = "https://www.youtube.com/watch?v=" + sharedId;
    run();
  }

  // service worker (installable PWA)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});
