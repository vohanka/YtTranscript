{
  "name": "Přepis YouTube",
  "short_name": "Přepis",
  "description": "Vlož odkaz na YouTube video a přečti si přepis.",
  "start_url": ".",
  "scope": ".",
  "share_target": {
    "action": "./",
    "method": "GET",
    "params": { "title": "title", "text": "text", "url": "url" }
  },
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#12131a",
  "theme_color": "#12131a",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "./icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
