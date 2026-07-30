import { company } from '@/lib/env';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold">{company().name}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Interim Billing
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
