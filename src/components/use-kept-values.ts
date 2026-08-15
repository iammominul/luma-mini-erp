'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Form values that survive a save that came back with an error.
 *
 * A server action returns to the browser by re-rendering this page on the
 * server, and the server has no idea what anyone typed: for a new record it
 * sends back an empty party, an empty number and today's date. A field left
 * uncontrolled takes those blanks, so a bill that failed on a repeated bill
 * number emptied its whole header and had to be keyed again, only to empty
 * itself again on the next error. Holding the values here instead means the
 * server's blanks are never read after the first render: `useState` takes them
 * once, on mount, and nothing later can reach back in and clear the form.
 *
 * A select and a checkbox each need the extra step. React resets the form once
 * an action finishes; a controlled text field is put back on the next render,
 * because React writes the value whenever it differs from what is in the DOM,
 * but a select is driven through its options and the reset one is left alone,
 * and a checkbox is reset to the checked state it was rendered with. Either
 * way the control goes back to a default while this hook still holds the
 * answer. `register` hands back a ref that puts both kinds back where they
 * belong.
 *
 *   const { values, set, register } = useKeptValues({ partyId, mode }, state);
 *   <select ref={register('mode')} value={values.mode}
 *           onChange={(e) => set({ mode: e.target.value })} />
 *
 * A checkbox is held as 'yes' or the empty string, so every value in here stays
 * a string and what the form posts is the same either way.
 */
export function useKeptValues<T extends Record<string, string>>(
  initial: T,
  /** The action result, which changes every time a save comes back. */
  actionState: unknown,
) {
  const [values, setValues] = useState<T>(initial);

  const set = (patch: Partial<T>) =>
    setValues((current) => ({ ...current, ...patch }));

  const controls = useRef(
    new Map<keyof T, HTMLSelectElement | HTMLInputElement | null>(),
  );

  const register =
    (name: keyof T) => (element: HTMLSelectElement | HTMLInputElement | null) => {
      controls.current.set(name, element);
    };

  useEffect(() => {
    for (const [name, element] of controls.current) {
      const wanted = values[name];
      if (!element || wanted === undefined) continue;
      if (element instanceof HTMLInputElement && element.type === 'checkbox') {
        const checked = wanted !== '';
        if (element.checked !== checked) element.checked = checked;
      } else if (element.value !== wanted) {
        element.value = wanted;
      }
    }
  }, [actionState, values]);

  return { values, set, register };
}
