import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.sintagma.app',
  appName: 'СИНТАГМА',
  webDir: 'dist',
  // Bundle the application with the APK; never load a remote website as the app.
  server: { androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false, backgroundColor: '#F9F8F5' }
};

export default config;
