// Admin is deliberately absent: public registration may only create these roles.
const ROLE_OPTIONS = [
  { value: 'client', title: 'Client', copy: 'Browse gigs and book freelance services.' },
  { value: 'freelancer', title: 'Freelancer', copy: 'List your services and track bookings and income.' }
];

export default function RoleSelector({ value, onChange, error, disabled }) {
  const errorId = error ? 'role-error' : undefined;

  return (
    <fieldset className="role-options" aria-describedby={errorId} disabled={disabled}>
      <legend>Account type</legend>
      <div className="role-grid">
        {ROLE_OPTIONS.map((option) => {
          const checked = value === option.value;
          return (
            <label key={option.value} className="role-option">
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={checked}
                onChange={onChange}
                aria-invalid={error ? 'true' : undefined}
              />
              <span className="role-option-title">
                {option.title}
                <span aria-hidden="true" className="role-option-mark">{checked ? '[x]' : '[ ]'}</span>
              </span>
              <span className="role-option-copy">{option.copy}</span>
            </label>
          );
        })}
      </div>
      {error && <p id={errorId} className="field-error">{error}</p>}
    </fieldset>
  );
}