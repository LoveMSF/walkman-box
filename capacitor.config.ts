import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lovemsf.offlineplayer',
  appName: 'WalkmanBox',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: { allowMixedContent: false },
  plugins: { SplashScreen: { launchShowDuration: 0 } },
}

export default config
