import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.de6a32b70156436ea4af4c3859513826',
  appName: 'trevo-premier-vault',
  webDir: 'dist',  // Use local bundled files instead of remote URL
  bundledWebRuntime: false,
  server: {
    // REMOVE the 'url' line entirely - this forces local loading
    androidScheme: 'https',  // This helps with routing
    cleartext: true,
    allowNavigation: ['*']  // Allow navigation if needed
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true  // Keep for debugging
  }
};

export default config;
