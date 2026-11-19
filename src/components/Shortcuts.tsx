'use client';

import { useEffect } from 'react';

/** Typing in one of these, a letter is text, not a command. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

/**
 * The keys a clerk coming from a spreadsheet reaches for, set once for every
 * screen. Ctrl+K for search is the search box's own and is not repeated here.
 *
 *   Ctrl+S  save the form being worked in, the way every desktop program
 *           saves. The browser's own Save Page is never what anybody wanted
 *           on a bill. It submits through the form's own submit button, so
 *           the server action, its validation and its kept values all run
 *           exactly as a click would.
 *   /       jump to search, from anywhere that is not a field.
 *
 * Only the form the cursor is in is saved. With focus outside any form, a
 * screen holding exactly one form saves that one; a screen with several does
 * nothing, because guessing which of two forms to submit is how the wrong one
 * gets saved.
 */
export function Shortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        const active = document.activeElement;
        let form = active instanceof HTMLElement ? active.closest('form') : null;
        if (!form) {
          const forms = Array.from(
            document.querySelectorAll<HTMLFormElement>('main form'),
          ).filter((candidate) =>
            candidate.querySelector('button[type="submit"], button:not([type])'),
          );
          if (forms.length === 1) form = forms[0]!;
        }
        if (!form) return;
        event.preventDefault();
        const submit = form.querySelector<HTMLButtonElement>(
          'button[type="submit"]:not(:disabled), button:not([type]):not(:disabled)',
        );
        form.requestSubmit(submit ?? undefined);
        return;
      }

      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !isTyping(event.target)) {
        const search = document.querySelector<HTMLInputElement>(
          'input[aria-label="Search records"]',
        );
        if (!search) return;
        event.preventDefault();
        search.focus();
        search.select();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}
