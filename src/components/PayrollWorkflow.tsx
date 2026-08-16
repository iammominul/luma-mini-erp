'use client';

import { useActionState } from 'react';
import { Button, Card, Field, Notice, TextInput } from './ui';

export type WorkflowState = { error?: string };

type Action = (
  state: WorkflowState,
  formData: FormData,
) => Promise<WorkflowState>;

/**
 * Moving a run on.
 *
 * The name used to be typed here, because one shared password opened the app
 * and it could not know who was at the keyboard. Named users arrived on
 * 2026-08-14, so the name is now the signed-in account's and the field is gone:
 * asking somebody to type who they are when the server already knows invites
 * them to type somebody else. Only an Owner reaches these buttons, checked on
 * the server in the action, so the name on a payslip is one that was proved.
 */
export function PayrollWorkflow({
  runId,
  period,
  status,
  approvedBy,
  paidBy,
  approverName,
  canApprove,
  today,
  approve,
  markPaid,
  reopen,
}: {
  runId: string;
  period: string;
  status: 'draft' | 'approved' | 'paid';
  approvedBy: string | null;
  paidBy: string | null;
  /** The signed-in Owner, shown so it is clear whose name will be recorded. */
  approverName: string;
  /** Whether this account may approve, pay or reopen. Owner only. */
  canApprove: boolean;
  today: string;
  approve: Action;
  markPaid: Action;
  reopen: Action;
}) {
  const [approveState, approveSubmit, approving] = useActionState<
    WorkflowState,
    FormData
  >(approve, {});
  const [paidState, paidSubmit, paying] = useActionState<WorkflowState, FormData>(
    markPaid,
    {},
  );
  const [reopenState, reopenSubmit, reopening] = useActionState<
    WorkflowState,
    FormData
  >(reopen, {});

  const hidden = (
    <>
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="period" value={period} />
    </>
  );

  // Accounts prepares the month and an Owner signs it off, so this card states
  // where the run stands rather than offering a button that would be refused.
  if (!canApprove) {
    return (
      <Card className="mb-4 p-4 text-sm">
        {status === 'draft' ? (
          <p className="text-[var(--color-muted)]">
            This payroll is a draft. An Owner approves it once the figures are
            right.
          </p>
        ) : null}
        {status === 'approved' ? (
          <p>
            Approved by{' '}
            <span className="font-medium">
              {approvedBy ?? 'somebody no longer recorded'}
            </span>
            . The figures are frozen and an Owner marks it paid.
          </p>
        ) : null}
        {status === 'paid' ? (
          <p>
            Paid by{' '}
            <span className="font-medium">
              {paidBy ?? 'somebody no longer recorded'}
            </span>
            , approved by{' '}
            <span className="font-medium">
              {approvedBy ?? 'somebody no longer recorded'}
            </span>
            .
          </p>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="mb-4 p-4">
      {status === 'draft' ? (
        <form action={approveSubmit} className="space-y-3">
          {hidden}
          <p className="text-sm text-[var(--color-muted)]">
            Approving freezes every figure on this payroll. Reopen it if a
            correction is needed afterwards. It will be recorded as approved by{' '}
            <span className="font-medium text-[var(--color-ink)]">
              {approverName}
            </span>
            , which prints on the payslip and goes in the activity log.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Button type="submit" icon="check" disabled={approving}>
              {approving ? 'Approving' : 'Approve Payroll'}
            </Button>
          </div>
          {approveState.error ? (
            <Notice tone="error">{approveState.error}</Notice>
          ) : null}
        </form>
      ) : null}

      {status === 'approved' ? (
        <div className="space-y-4">
          <form action={paidSubmit} className="space-y-3">
            {hidden}
            <p className="text-sm">
              Approved by{' '}
              <span className="font-medium">
                {approvedBy ?? 'somebody no longer recorded'}
              </span>
              . The figures are frozen. Marking it paid locks the run and
              records {approverName} as having paid it.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-48">
                <Field label="Date Paid">
                  <TextInput
                    type="date"
                    name="paidOn"
                    defaultValue={today}
                    required
                  />
                </Field>
              </div>
              <Button type="submit" icon="check" disabled={paying}>
                {paying ? 'Saving' : 'Mark Paid'}
              </Button>
            </div>
            {paidState.error ? (
              <Notice tone="error">{paidState.error}</Notice>
            ) : null}
          </form>

          <ReopenForm
            hidden={hidden}
            submit={reopenSubmit}
            pending={reopening}
            error={reopenState.error}
          />
        </div>
      ) : null}

      {status === 'paid' ? (
        <div className="space-y-4">
          <p className="text-sm">
            Paid by{' '}
            <span className="font-medium">
              {paidBy ?? 'somebody no longer recorded'}
            </span>
            , approved by{' '}
            <span className="font-medium">
              {approvedBy ?? 'somebody no longer recorded'}
            </span>
            . Nothing on this payroll can change while it is paid.
          </p>
          <ReopenForm
            hidden={hidden}
            submit={reopenSubmit}
            pending={reopening}
            error={reopenState.error}
          />
        </div>
      ) : null}
    </Card>
  );
}

/** Sending a run back to draft always states why, because somebody will ask. */
function ReopenForm({
  hidden,
  submit,
  pending,
  error,
}: {
  hidden: React.ReactNode;
  submit: (formData: FormData) => void;
  pending: boolean;
  error?: string;
}) {
  return (
    <form
      action={submit}
      className="space-y-3 border-t border-[var(--color-line)] pt-4"
    >
      {hidden}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full flex-1 sm:min-w-72">
          <Field
            label="Reason for Reopening"
            hint="Kept in the activity log with the figures as they stood."
          >
            <TextInput name="reason" maxLength={300} required autoComplete="off" />
          </Field>
        </div>
        <Button type="submit" icon="undo" disabled={pending}>
          {pending ? 'Reopening' : 'Reopen Payroll'}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </form>
  );
}
