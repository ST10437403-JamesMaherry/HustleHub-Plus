import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import TextField from '../components/auth/TextField';
import PasswordField from '../components/auth/PasswordField';
import FormMessage from '../components/auth/FormMessage';
import { EMAIL_MAX_LENGTH, isPossiblePassword, validateLogin } from '../components/auth/validation';
import { INVALID_CREDENTIALS, describeAuthError, focusField } from '../components/auth/authErrors';
import '../components/auth/auth.css';

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const registeredEmail = typeof location.state?.registeredEmail === 'string'
    ? location.state.registeredEmail
    : '';

  const [values, setValues] = useState({ email: registeredEmail, password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  }

  function rejectCredentials(form, message) {
    setValues((current) => ({ ...current, password: '' }));
    setFormError(message);
    focusField(form, 'password');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending.current) return;

    const form = event.currentTarget;
    const fieldErrors = validateLogin(values);
    setFormError('');
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length) {
      focusField(form, Object.keys(fieldErrors)[0]);
      return;
    }

    // No account can hold a password outside the bcrypt byte range, so skip the
    // request rather than spend one of the rate-limited login attempts.
    if (!isPossiblePassword(values.password)) {
      rejectCredentials(form, INVALID_CREDENTIALS);
      return;
    }

    pending.current = true;
    setSubmitting(true);

    try {
      await login({ email: values.email.trim().toLowerCase(), password: values.password });
      // GuestRoute performs the redirect once the session is authenticated.
    } catch (error) {
      const outcome = describeAuthError(error, 'login');
      if (outcome) rejectCredentials(form, outcome.form);
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="page auth-layout">
      <header className="page-heading">
        <p className="eyebrow">Account access</p>
        <h1>Sign in.</h1>
        <p className="page-description">
          Clients book services. Freelancers manage gigs, bookings and income.
        </p>
      </header>

      <form className="form-stack" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        {registeredEmail && !formError && (
          <FormMessage tone="success">Account created. Sign in to continue.</FormMessage>
        )}
        <FormMessage>{formError}</FormMessage>

        <TextField
          id="login-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={EMAIL_MAX_LENGTH}
          value={values.email}
          onChange={handleChange}
          error={errors.email}
          disabled={submitting}
          autoFocus={!registeredEmail}
        />
        <PasswordField
          id="login-password"
          name="password"
          label="Password"
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          disabled={submitting}
          autoFocus={Boolean(registeredEmail)}
        />

        <button type="submit" className="button-block" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="form-footer">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </form>
    </section>
  );
}