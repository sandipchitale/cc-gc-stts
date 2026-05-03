# cc-gc-stts

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](https://nodejs.org/)

Talk to **Claude Code** or **Gemini CLI** and hear them talk back. This project adds seamless Speech-to-Text (STT) and Text-to-Speech (TTS) capabilities via a Model Context Protocol (MCP) server.

![Talk](screenshots/stts-prompt.png)
![Listen](screenshots/stts-response.png)

## ✨ Features

- 🎙️ **Speech-to-Text (STT):** Dictate your prompts instead of typing.
- 🔊 **Text-to-Speech (TTS):** Hear the model's responses read aloud.
- 🔄 **Conversational Loop:** Use the `/stts` command for a continuous voice-driven session.
- 🚀 **Persistent Daemon:** Fast startup using a reusable Chrome window.
- 🛠️ **Cross-Platform:** Works with both Claude Code and Gemini CLI.
- 🕘 **History:** Recall past prompts and responses from a dropdown above each panel, or with `Alt+↑` / `Alt+↓`.
- 🌐 **Multilingual:** Per-side **Language** dropdown for English (US), Hindi, and Marathi — in either Devanagari or Latin (ITRANS) script.

## 🏗️ How It Works

`stts` uses a background daemon to manage a persistent Chrome/Chromium window:

1.  **MCP Server:** Exposes `stt` and `tts` tools to the AI model. Talks to the daemon directly over HTTP — no per-call subprocess spawn.
2.  **Daemon:** A local HTTP server (port `15986`) that controls a Chrome instance in "app mode". Stores its profile under `$TMPDIR/cc-gc-stts-user-data-dir`.
3.  **Browser UI:** Uses the native **Web Speech API** for recognition and synthesis. Free at the wallet — note that on Linux Chrome routes recognition audio through Google's servers, so this is not a fully offline pipeline.
4.  **Automatic Lifecycle:** The daemon starts on demand and shuts down when the Chrome window is closed.
5.  **Port-collision aware:** If port `15986` is held by a non-stts process, the launcher fails fast with a clear error instead of timing out.

## 🚀 Quick Start

### 1. Build the project

```bash
npm install
npm run build
```

### 2. Install

#### **Claude Code**
```bash
claude plugins marketplace add https://github.com/sandipchitale/cc-gc-stts.git
claude plugin install stts
```

#### **Gemini CLI**
```bash
gemini extensions install --consent https://github.com/sandipchitale/cc-gc-stts.git
```

## ⌨️ Usage

### Conversational Loop
Run the voice-driven loop where you speak, the model processes, and the response is read back to you:
- **Claude Code:** `/stts`
- **Gemini CLI:** `/stts`

### Direct Tool Usage
You can also ask the model to "use the stt tool" or "speak this using tts" directly in your prompts.

## 🗣️ Voice Commands & Shortcuts

Both STT and TTS modes support voice-activated commands for a hands-free experience.

### Popular Commands
| Command | Action |
| :--- | :--- |
| `send prompt` | Submits your dictated text |
| `cancel prompt` | Aborts the current recording |
| `new paragraph` | Inserts a line break |
| `got it` | (TTS mode) Acknowledges the response and continues |
| `stop it` | (TTS mode) Stops the current playback |

> **Note:** Many more punctuation and formatting commands are supported (e.g., `insert comma`, `select all`, `undo it`). Toggle the side panel to see the full list.

**Keyboard Shortcuts:**
- `Ctrl+R`: Toggle recording/playback side panel.
- `Enter`: Send prompt (Talk side).
- `Escape`: Stop recording or close the commands panel.
- `Alt+↑` / `Alt+↓`: Cycle through prompt or response history when the textarea is focused.

![Voice command side panel](screenshots/stts-voice-commands.png)

## 🌐 Spoken Language

Each panel has a **Lang** dropdown above the textarea. Defaults to **English (US)** on both sides. Available options:

| Option | STT recognition | TTS voice | Script seen in textarea |
| :--- | :--- | :--- | :--- |
| English (US) | `en-US` | `en-US` | Latin |
| Hindi (देवनागरी) | `hi-IN` | `hi-IN` | Devanagari |
| Hindi (Latin) | `hi-IN` | `hi-IN` | Latin (ITRANS) |
| Marathi (देवनागरी) | `mr-IN` | `mr-IN` | Devanagari |
| Marathi (Latin) | `mr-IN` | `mr-IN` | Latin (ITRANS) |

**How the LLM honors the language:** the STT side hands the model text in the chosen script. The model naturally answers in the same language; the response is then read out by a voice that matches the **response** Lang dropdown. For best results pick the same language on both sides.

**Latin variants** use [Sanscript](https://github.com/indic-transliteration/sanscript.js) (loaded from CDN) to transliterate via the ITRANS scheme:
- **STT → textarea:** Devanagari output from the recognizer is converted to Latin so the prompt the model sees is romanized.
- **TTS → speech:** if the response text is purely Latin/ITRANS, it is converted to Devanagari before being spoken so the Hindi/Marathi voice pronounces it correctly. Mixed or already-Devanagari text is left alone.

**Caveats:**
- Web Speech recognition for `hi-IN` and `mr-IN` requires Chrome's network speech service (Google).
- Voice commands (`send prompt`, `got it`, etc.) are recognized in English only. When you switch the Talk side away from English, use the keyboard / buttons for those actions.
- Selections persist in `localStorage` (`__stts__lang_prompt`, `__stts__lang_response`).

## 🕘 Prompt & Response History

Each panel has a **History** bar above its textarea:

- **Talk** stores every submitted prompt; **Listen** stores every response received from the model.
- Pick an entry from the dropdown to load it into the textarea — fully editable. Hit **Enter** / **Send** to resubmit a prompt, or **Play** to replay a response.
- `Alt+↑` walks back through history; `Alt+↓` walks forward (your in-progress draft is preserved and restored at the bottom of the stack).
- History persists across sessions in `localStorage`, capped at 50 entries per side. Consecutive duplicates are not stored.
- Use the **Clear** button to wipe one side's history.

## 🛠️ Development & Manual Install

### Install from a local source

**Claude Code:**
```bash
claude plugins marketplace add "$PWD"
claude plugin install stts
```

**Gemini CLI:**
```bash
gemini extensions install --consent "$PWD"
```

### Daemon Control
The daemon usually runs automatically, but you can manually stop it by closing the Chrome window or:
```bash
curl -X POST http://127.0.0.1:15986/api/shutdown
```

### Project Layout
- `src/stts-mcp-server.ts` — MCP server exposing the `stt` and `tts` tools. Calls the daemon HTTP API directly.
- `src/stts-daemon.ts` — local HTTP server on port `15986` that owns the Chrome window.
- `src/daemon-client.ts` — shared HTTP client used by the MCP server and the CLI.
- `src/stts.ts` — standalone CLI (`stts stt` / `stts tts`) for manual use and diagnostics.
- `src/stts_ui.html` — the Web Speech API UI rendered inside the Chrome window.

## 📋 Requirements

- **Node.js:** v18 or higher.
- **Chrome/Chromium:** Must be installed and discoverable.
- **Microphone:** Required for STT functionality.

## 📄 License

MIT — [Sandip Chitale](https://github.com/sandipchitale)
