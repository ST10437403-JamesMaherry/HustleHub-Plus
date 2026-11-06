import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { apiRequest } from '../services/api';
import TextField from '../components/auth/TextField';
import PasswordField from '../components/auth/PasswordField';
import RoleSelector from '../components/auth/RoleSelector';
import FormMessage from '../components/auth/FormMessage';
import {
  EMAIL_MAX_LENGTH,
  FULL_NAME_MAX_LENGTH,
  normaliseRegistration,
  validateRegistration
} from '../components/auth/validation';
import { describeAuthError, focusField } from '../components/auth/authErrors';
import '../components/auth/auth.css';

const EMPTY_FORM = { fullName: '', email: '', password: '', confirmPassword: '', role: '' };

export default function RegisterPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending.current) return;

    const form = event.currentTarget;
    const fieldErrors = validateRegistration(values);
    setFormError('');
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length) {
      focusField(form, Object.keys(fieldErrors)[0]);
      return;
    }

    pending.current = true;
    setSubmitting(true);

    try {
      // confirmPassword is a client-only check and is never sent.
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: normaliseRegistration(values)
      });
      const email = typeof data?.user?.email === 'string'
        ? data.user.email
        : normaliseRegistration(values).email;

      // Registration does not issue a token; the user signs in explicitly.
      void navigate('/login', { replace: true, state: { registeredEmail: email } });
    } catch (error) {
      const outcome = describeAuthError(error, 'register');
      if (!outcome) return;

      setValues((current) => ({ ...current, password: '', confirmPassword: '' }));
      if (outcome.fields) {
        setErrors(outcome.fields);
        focusField(form, Object.keys(outcome.fields)[0]);
      } else {
        setFormError(outcome.form);
      }
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="page auth-layout">
      <header className="page-heading">
        <p className="eyebrow">Account access</p>
        <h1>Create an account.</h1>
        <p className="page-description">
          Join as a client to book services, or as a freelancer to sell them.
          Administrator accounts are provisioned separately.
        </p>
      </header>

      <form className="form-stack" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <FormMessage>{formError}</FormMessage>

        <RoleSelector
          value={values.role}
          onChange={handleChange}
          error={errors.role}
          disabled={submitting}
        />
        <TextField
          id="register-full-name"
          name="fullName"
          label="Full name"
          autoComplete="name"
          maxLength={FULL_NAME_MAX_LENGTH}
          value={values.fullName}
          onChange={handleChange}
          error={errors.fullName}
          disabled={submitting}
        />
        <TextField
          id="register-email"
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
        />
        <PasswordField
          id="register-password"
          name="password"
          label="Password"
          autoComplete="new-password"
          hint="8 to 72 characters."
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          disabled={submitting}
        />
        <PasswordField
          id="register-confirm-password"
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          disabled={submitting}
        />

        <button type="submit" className="button-block" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Create account'}
        </button>

        <p className="form-footer">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </section>
  );
}