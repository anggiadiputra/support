import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
      ],
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    env: {
      META_APP_ID: 'test_app_id_123',
      META_APP_SECRET: 'test_app_secret_456',
      META_CONFIG_ID: 'test_config_id_789',
      OAUTH_REDIRECT_URI: 'https://test.example.com/waba/callback',
      WEBHOOK_BASE_URL: 'https://test.example.com',
      WABA_TOKEN_ENCRYPTION_KEY: Buffer.from('a'.repeat(32)).toString('base64'),
    },
  },
});
