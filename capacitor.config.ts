import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.hightimeline.mobile',
  appName: 'High Timeline',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
