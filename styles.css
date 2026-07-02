# Přepis YouTube

Frontendová PWA bez vlastního backendu. Vlož odkaz na YouTube video → zobrazí se
přepis (s časy, hledáním, kopírováním a exportem do `.txt`). Na mobilu jde přidat
na plochu a chovat se jako nativní appka. Ťuknutí na čas otevře video na daném
místě (na mobilu deep-linkem do YouTube appky).

## Nasazení na GitHub Pages

1. Vytvoř repo a nahraj do něj obsah složky `yt-transcript-web` (soubory musí být
   v kořeni repa, ne ve vnořené složce).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, složka `/ (root)`, Save.
3. Za chvíli appka pojede na `https://TVUJ-NICK.github.io/NAZEV-REPA/`.

> Pages servíruje přes HTTPS, což PWA i CORS proxy vyžadují. Hotovo.

## Instalace na mobil (Přidat na plochu)

- **Android / Chrome:** otevři URL → menu (⋮) → *Přidat na plochu* / *Instalovat aplikaci*.
- **iOS / Safari:** otevři URL → Sdílet → *Přidat na plochu*.

Pak se spouští na celou obrazovku s vlastní ikonou.

## Shrnutí videa přes AI (hlavní workflow)

Use case: půlhodinové video, podezření, že v něm nic není → chci verdikt od AI.

**Android (nejrychlejší):** nainstaluj PWA na plochu. Pak v YouTube appce
*Sdílet → Přepis* — přepis se sám načte. Ťukni **Kopírovat pro AI** (zkopíruje
přepis i s promptem „shrň + verdikt, jestli to sledovat") a vlož do Claude /
ChatGPT appky. Nebo ťukni **Sdílet** a pošli text rovnou do AI appky přes share
sheet.

**iOS:** Web Share Target Safari neumí, takže: zkopíruj odkaz videa → otevři
Přepis → *Vložit ze schránky* → **Kopírovat pro AI** → vlož do Claude/ChatGPT.

Prompt jde upravit v *Nastavení* (placeholder `{title}` se nahradí názvem
videa). Žádný API klíč není potřeba — používáš AI appky, které už máš.

## Jak to funguje

```
odkaz ─► videoId ─► (přes CORS proxy) fetch watch stránky
       ─► extrakce ytInitialPlayerResponse (balanced-brace parser)
       ─► captionTracks[].baseUrl + "&fmt=json3"
       ─► (přes CORS proxy) fetch JSON ─► text + časy ─► render
```

Proč proxy: stránka běží na jiné doméně než youtube.com a YouTube nevrací CORS
hlavičky, takže přímý `fetch` prohlížeč zablokuje. Proxy přidá
`Access-Control-Allow-Origin`. To je jediný důvod, proč tu proxy je.

## CORS proxy a spolehlivost

Výchozí jsou veřejné proxy (AllOrigins → corsproxy.io → CodeTabs) a appka je při
chybě **automaticky vystřídá**. Jsou zdarma, ale občas spadnou, zpomalí nebo mají
rate-limit.

**Pro 100% spolehlivost** nasaď vlastní Cloudflare Worker — viz
[`cloudflare-worker.js`](./cloudflare-worker.js) (návod nahoře v souboru). Zdarma,
~2 minuty, žádná instalace. Pak v *Nastavení* appky vyber „Vlastní Cloudflare
Worker" a vlož jeho URL končící `?url=`.

## Limity

- Funguje jen na videích s titulky (manuální i auto-generované).
- YouTube občas u některých videí zaškrtne baseUrl `pot` tokenem → prázdná
  odpověď. Běžná veřejná videa projdou.
- Když se YouTube formát změní, nejspíš bude potřeba doladit `extractJsonAfter`
  nebo cestu ke `captionTracks` v `app.js`.

## Soubory

| soubor | role |
|---|---|
| `index.html` | UI |
| `styles.css` | styl (mobile-first) |
| `app.js` | parsování URL, fetch přes proxy, extrakce a render přepisu |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | service worker (offline shell + instalace) |
| `cloudflare-worker.js` | volitelná vlastní proxy |
| `icons/` | ikony appky |
