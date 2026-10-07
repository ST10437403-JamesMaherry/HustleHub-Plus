import { useState } from 'react';
import TextField from './TextField';

export default function PasswordField({ id, label, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      id={id}
      label={label}
      type={visible ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      labelAction={(
        <button
          type="button"
          className="field-toggle"
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? 'Hide' : 'Show'}
          <span className="visually-hidden"> {label.toLowerCase()}</span>
        </button>
      )}
      {...props}
    />
  );
}