const SCRIPT_STYLE_BLOCK_PATTERN =
  /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const HTML_COMMENT_PATTERN =
  /<!--[\s\S]*?-->/g;

const HTML_TAG_PATTERN =
  /<\/?[a-z][^>]*>/gi;

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Removes markup and unsafe control characters from plain-text input.
 */
const sanitizeText = (value) => {
  return value
    .replace(SCRIPT_STYLE_BLOCK_PATTERN, '')
    .replace(HTML_COMMENT_PATTERN, '')
    .replace(HTML_TAG_PATTERN, '')
    .replace(CONTROL_CHARACTER_PATTERN, '')
    .trim();
};

/**
 * Sanitises only explicitly listed text fields.
 *
 * Validation still decides whether the resulting values are acceptable.
 */
const sanitizeFields = (...fieldNames) => {
  return (req, res, next) => {
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    ) {
      return next();
    }

    const sanitizedBody = {
      ...req.body
    };

    fieldNames.forEach((fieldName) => {
      if (
        typeof sanitizedBody[fieldName] === 'string'
      ) {
        sanitizedBody[fieldName] = sanitizeText(
          sanitizedBody[fieldName]
        );
      }
    });

    req.body = sanitizedBody;

    return next();
  };
};

module.exports = {
  sanitizeFields
};