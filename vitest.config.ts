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
    // The money and statement logic, the permission matrix, the schema splitter,
    // and (when a Postgres is configured) every SQL statement and server action.
    // src/components holds one pure module, nav-items.ts, and no component test:
    // presentation is not tested here, but which entries a role is offered is.
    include: [
      'src/lib/**/*.test.ts',
      'src/app/**/*.test.ts',
      'src/components/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/amount.ts',
        'src/lib/statement.ts',
        'src/lib/money.ts',
        'src/lib/format.ts',
        'src/lib/permissions.ts',
        'src/components/nav-items.ts',
      ],
    },
  },
});
