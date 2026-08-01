'use client';

/**
 * The last resort: a failure in the root layout itself, where the app's own
 * chrome and stylesheet are not available. It replaces the whole document, so it
 * carries its own html and body and leans on nothing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          color: '#142b40',
          margin: 0,
          padding: '4rem 1rem',
        }}
      >
        <main style={{ maxWidth: '32rem', margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.125rem', margin: 0 }}>
            The Application Could Not Start
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#5b6b7a' }}>
            This is a fault in the app itself rather than in any record. No entry
            has been changed. Quote the reference below when reporting it.
          </p>
          {error.digest ? (
            <p style={{ fontSize: '0.875rem' }}>Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#142b40',
              color: '#fff',
              border: 0,
              borderRadius: '0.25rem',
              padding: '0.375rem 0.75rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </main>
      </body>
    </html>
  );
}
