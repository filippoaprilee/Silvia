# 🌿 Silvia — App di benessere

Un'app di benessere psicologico personale per Silvia, basata su tecniche scientificamente provate (CBT, ACT, MBSR, PMR).

## Funzionalità

- 💬 **Chat con terapista AI** — Claude API, system prompt costruito su psicologia clinica reale
- 🌬️ **Esercizi di respiro** — 4-7-8, Box Breathing, Respirazione rilassante
- 🧘 **Tecniche di benessere** — Grounding, PMR, Body Scan, Defusione cognitiva ACT, Pomodoro
- 📖 **Diario privato** — sfogo libero, tag automatici, salvataggio locale
- 📊 **Percorso nel tempo** — grafico umore, streak, statistiche
- 📧 **Notifiche email** — riassunto automatico + alert umore basso via Gmail MCP

## Deploy su GitHub Pages

1. Crea una repo GitHub (es. `silvia-app`)
2. Carica i 3 file: `index.html`, `style.css`, `app.js`
3. Vai in **Settings → Pages → Branch: main → / (root)**
4. L'app sarà disponibile su `https://[tuo-username].github.io/silvia-app/`

## Installazione su iPhone/iPad (PWA)

1. Apri l'URL in **Safari**
2. Tasto condividi → **"Aggiungi a schermata Home"**
3. L'app si installa come app nativa con icona 🌿

## Note tecniche

- Single-page app, zero dipendenze esterne (solo Google Fonts)
- Dati salvati in `localStorage` — privati, sul dispositivo
- Chat usa `claude-sonnet-4-6` via Anthropic API (proxy integrato in Claude.ai)
- Email tramite Gmail MCP (richiede Gmail connesso su Claude.ai)

## File

```
silvia-app/
├── index.html   # Struttura HTML
├── style.css    # Design system completo
├── app.js       # Logica + Claude API + storage
└── README.md
```
