export default function TextField({ id, label, error, hint, labelAction, ...inputProps }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <div className="field-label-row">
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {hint && !error && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}