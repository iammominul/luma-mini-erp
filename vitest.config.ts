import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same alias the app uses, so a server action under src/app can be called
    // straight from a test.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: false,
    // The money and statement logic, the session cookie, and (when a Postgres
    // is configured) every SQL statement and server action.
    include: ['src/lib/**/*.test.ts', 'src/app/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/amount.ts',
        'src/lib/statement.ts',
        'src/lib/money.ts',
        'src/lib/format.ts',
        'src/lib/auth.ts',
      ],
    },
  },
});
