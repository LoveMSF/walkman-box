# WalkmanBox

An offline-first music player for the music you keep on your device. WalkmanBox runs in the browser and packages for Android with Capacitor.

## Features

- **Nothing-inspired interface:** OLED black or crisp off-white light mode, dot-matrix typography, precise borders, and restrained Nothing Red accents.
- **Local music library:** Import audio files or folders in MP3, WAV, FLAC, OGG, M4A, AAC, and Opus formats. Audio, track details, favourites, and playlists persist in IndexedDB without cloud uploads.
- **No app-imposed library limit:** Available space depends on device storage and browser or Android WebView quotas. The app shows a storage estimate where supported.
- **Offline-ready:** The web app shell is cached after its first online load. Your imported audio stays on-device for offline playback across restarts.
- **Playback tools:** Search, favourites, custom playlists, shuffle, repeat modes, seek, playback speed, and a persistent mini-player.
- **Now Playing:** Hardware-inspired disc artwork, real-time dot-matrix spectrum visualizer, and three-band Web Audio equalizer.
- **Demo tracks:** Two original synthwave tracks are synthesized locally the first time the library opens.

## Technology

React, TypeScript, Vite, Tailwind CSS, Lucide, IndexedDB, Web Audio API, Capacitor 7, and Android Gradle. The UI fonts are bundled locally; `index.html` also includes the requested Google Fonts for Space Mono, JetBrains Mono, and Silkscreen.

## Run locally

Install Node.js 20+ and pnpm, then run:

```sh
pnpm install
pnpm dev
```

Run the type check and create a production build with:

```sh
pnpm typecheck
pnpm build
pnpm preview
```

Production files are written to `dist/`. Vite uses `base: './'` for relative asset paths in packaged builds.

## Build for Android locally

Install Android Studio with Android SDK 35 and Java 17. Then build and sync the web assets:

```sh
pnpm install
pnpm build
pnpm exec cap sync android
```

If the `android/` project does not exist yet, create it before syncing:

```sh
pnpm exec cap add android
pnpm exec cap sync android
```

Build a debug APK from the Android project directory:

```sh
cd android
./gradlew assembleDebug
```

On Windows, run `gradlew.bat assembleDebug`. The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Build an APK with GitHub Actions

The **Build Android APK** workflow at `.github/workflows/build-apk.yml` runs on pushes and pull requests to `main` or `master`, and can also be started manually from **Actions**. It installs Java 17, Node.js 20, pnpm, and Android SDK 35; builds the web app; syncs Capacitor; and assembles a debug APK. Download **walkmanbox-debug-apk** from the completed workflow run's artifacts.

The workflow creates the Android platform when it is absent. Debug APKs are for testing; configure Android signing separately for a release build.
