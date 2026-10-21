import { h } from 'preact';
import { useState } from 'preact/hooks';

/** Copy-to-clipboard button with a transient "Copied" state (shared). */
export function CopyButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      class="mhx-copy"
      title={`Copy ${value}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}
