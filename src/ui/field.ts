/**
 * Options for `createField()`. The factory owns the label/input/hint markup and
 * the `.mhx-field*` classes; callers pass data only.
 */
export interface FieldOptions {
  label: string;
  name?: string;
  /** Initial text for the input. The field is uncontrolled, so later edits
   * live on the element, not here. */
  value?: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  status?: 'ok' | 'bad';
  onChange?: (value: string) => void;
}

export function createField(options: FieldOptions): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'mhx-field';
  if (options.status) field.dataset['status'] = options.status;

  const label = document.createElement('span');
  label.className = 'mhx-field-label';
  label.textContent = options.label;

  const input = document.createElement('input');
  input.type = options.type ?? 'text';
  if (options.name) input.name = options.name;
  if (options.value !== undefined) input.value = options.value;
  if (options.placeholder) input.placeholder = options.placeholder;
  input.disabled = options.disabled ?? false;
  input.required = options.required ?? false;
  if (options.onChange) {
    input.addEventListener('change', () => options.onChange?.(input.value));
  }

  field.append(label, input);
  if (options.hint) {
    const hint = document.createElement('span');
    hint.className = 'mhx-field-hint';
    hint.textContent = options.hint;
    field.appendChild(hint);
  }
  return field;
}
