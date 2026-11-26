# Cairn

**Cairn** is a local-first document and media workspace packaged as a Windows desktop application.

## Windows installer

Every push to `main` runs the **Build Cairn Windows EXE** workflow. When it completes, open the workflow run in GitHub Actions and download the `Cairn-Windows-EXE` artifact. It contains the Windows x64 NSIS installer.

The installer creates Start Menu and Desktop shortcuts. It installs per-user and does not require administrator access by default. Uninstalling the app does not intentionally remove the local Cairn vault.

## Build from source

Requirements: Windows 10/11 x64 and Node.js 24.

```bash
npm install
npm run desktop:dev
```

To create the installer locally on Windows:

```bash
npm run build:desktop
```

The installer is written to `release/`.

## Local data and AI

- Uploaded PDF, DOCX and TXT/Markdown/CSV text, chat sessions, and generated media are kept in the app's local browser vault (IndexedDB).
- Ollama is optional and is not bundled. Install Ollama separately, start its local service, and select the local model in Cairn's AI settings.
- Browser-based model weights need an internet connection for the first download. Once the model is cached, it can be loaded offline.
- The built-in Edge engine works without downloading a model, but it is a lightweight local assistant and not a full-size generative LLM.
- Scanned PDFs without a selectable text layer are not OCR-processed.

## Current media renderer

The current local image renderer draws Canvas/SVG scenes and document graphics. The audio renderer synthesizes WAV tones rather than natural human speech. The video renderer records locally rendered Canvas animations or document slides to WebM. These are local renderers, not neural text-to-image, human-voice, or cinematic video models.

## Security and privacy

The Electron window uses context isolation, sandboxing, and disabled Node integration. The packaged app is served from a restricted `app://cairn` origin; external HTTP(S) links open in the system browser. Ollama's documented default origin allowlist includes `app://*`, so its local API can be used without disabling browser security.
