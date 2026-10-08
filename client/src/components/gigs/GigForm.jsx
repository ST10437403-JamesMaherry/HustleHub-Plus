import { useRef, useState } from 'react';
import TextField from '../auth/TextField';
import FormMessage from '../auth/FormMessage';
import { focusField } from '../auth/authErrors';
import TextAreaField from './TextAreaField';
import {
  GIG_LIMITS,
  describeGigError,
  gigToForm,
  toGigPayload,
  validateGigForm
} from './gigValidation';

// The parent remounts this form (via key) to switch between create and edit,
// so initial state is read once from the gig being edited.
export default function GigForm({ gig, onSubmit, onCancel }) {
  const editing = Boolean(gig);
  const [values, setValues] = useState(() => gigToForm(gig));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);

  function handleChange(event) {
    const { name, type, value, checked } = event.target;
    setValues((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending.current) return;

    const form = event.currentTarget;
    const fieldErrors = validateGigForm(values);
    setFormError('');
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length) {
      focusField(form, Object.keys(fieldErrors)[0]);
      return;
    }

    pending.current = true;
    setSubmitting(true);

    try {
      await onSubmit(toGigPayload(values, editing));
    } catch (error) {
      const message = describeGigError(error);
      if (message) setFormError(message);
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  const descriptionLength = values.description.trim().length;

  return (
    <section className="gig-form-panel" aria-labelledby="gig-form-title">
      <p className="eyebrow">{editing ? 'Editing' : 'New gig'}</p>
      <h2 id="gig-form-title">{editing ? 'Edit your gig.' : 'List a service.'}</h2>

      <form className="form-stack" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <FormMessage>{formError}</FormMessage>

        <TextField
          id="gig-title"
          name="title"
          label="Title"
          maxLength={GIG_LIMITS.title.max}
          value={values.title}
          onChange={handleChange}
          error={errors.title}
          disabled={submitting}
          autoFocus={editing}
        />
        <TextField
          id="gig-category"
          name="category"
          label="Category"
          hint="For example Design, Development or Tutoring."
          maxLength={GIG_LIMITS.category.max}
          value={values.category}
          onChange={handleChange}
          error={errors.category}
          disabled={submitting}
        />
        <TextField
          id="gig-price"
          name="price"
          label="Price (ZAR)"
          inputMode="decimal"
          autoComplete="off"
          hint="Amount in rand, such as 450 or 1250.50."
          value={values.price}
          onChange={handleChange}
          error={errors.price}
          disabled={submitting}
        />
        <TextAreaField
          id="gig-description"
          name="description"
          label="Description"
          hint={`${descriptionLength} / ${GIG_LIMITS.description.max} characters, minimum ${GIG_LIMITS.description.min}.`}
          maxLength={GIG_LIMITS.description.max}
          value={values.description}
          onChange={handleChange}
          error={errors.description}
          disabled={submitting}
        />

        {editing && (
          <label className="form-check">
            <input
              type="checkbox"
              name="active"
              checked={values.active}
              onChange={handleChange}
              disabled={submitting}
            />
            Visible in the marketplace
          </label>
        )}

        <div className="gig-form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : editing ? 'Save changes' : 'Publish gig'}
          </button>
          {editing && (
            <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}