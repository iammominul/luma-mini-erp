import { company } from '@/lib/env';

/**
 * The letterhead used on a bill and on a statement. Both come from the
 * environment, so the printed page carries whatever company runs this
 * deployment.
 */
export function Letterhead({
  documentTitle,
  meta,
}: {
  documentTitle: string;
  meta: { label: string; value: string }[];
}) {
  const { name, address, phone, email } = company();

  return (
    <div className="border-b-2 border-[var(--color-navy)] pb-3">
      <div className="text-center">
        <div className="text-xl font-bold uppercase tracking-wide text-[var(--color-navy)]">
          {name}
        </div>
        {address ? <div className="mt-0.5 text-xs">{address}</div> : null}
        <div className="text-xs">
          {[phone ? `Phone: ${phone}` : '', email ? `Email: ${email}` : '']
            .filter(Boolean)
            .join('   ')}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-6">
        <div className="text-base font-semibold uppercase tracking-wide">
          {documentTitle}
        </div>
        <dl className="text-xs">
          {meta.map((item) => (
            <div key={item.label} className="flex justify-end gap-2">
              <dt className="text-[var(--color-muted)]">{item.label}:</dt>
              <dd className="font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** The signature block every printed document ends with. */
export function SignatureBlock({
  left = 'Prepared By',
  right = 'Authorized Signature',
}: {
  left?: string;
  right?: string;
}) {
  return (
    <div className="mt-12 flex justify-between gap-10 text-xs">
      <div className="w-56 border-t border-[var(--color-ink)] pt-1 text-center">
        {left}
      </div>
      <div className="w-56 border-t border-[var(--color-ink)] pt-1 text-center">
        {right}
      </div>
    </div>
  );
}
