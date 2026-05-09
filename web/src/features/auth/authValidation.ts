const REQUIRED_FIELD_ERROR =
  "\u041f\u043e\u043b\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0435 \u0434\u043b\u044f \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f";
const USERNAME_FORMAT_ERROR =
  "Username: 3-24 \u0441\u0438\u043c\u0432\u043e\u043b\u0430, \u043d\u0430\u0447\u0438\u043d\u0430\u0435\u0442\u0441\u044f \u0441 \u0431\u0443\u043a\u0432\u044b, \u0442\u043e\u043b\u044c\u043a\u043e \u0431\u0443\u043a\u0432\u044b, \u0446\u0438\u0444\u0440\u044b \u0438 _";
const EMAIL_FORMAT_ERROR =
  "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email";
const DISPLAY_NAME_FORMAT_ERROR =
  "\u0418\u043c\u044f: 2-40 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432, \u0431\u0443\u043a\u0432\u044b/\u0446\u0438\u0444\u0440\u044b \u0438 \u043f\u0440\u043e\u0431\u0435\u043b\u044b, ., _, ', -";
const PASSWORD_MIN_LENGTH_ERROR =
  "\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u043c\u0438\u043d\u0438\u043c\u0443\u043c 8 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432";
const PASSWORD_LETTER_ERROR =
  "\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u0443 \u0431\u0443\u043a\u0432\u0443";
const PASSWORD_COMMON_ERROR =
  "\u041f\u0430\u0440\u043e\u043b\u044c \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043f\u0440\u043e\u0441\u0442\u043e\u0439 \u0438\u043b\u0438 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0440\u0430\u0441\u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0435\u043d\u043d\u044b\u0439";
const PASSWORD_PERSONAL_INFO_ERROR =
  "\u041f\u0430\u0440\u043e\u043b\u044c \u043d\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c username \u0438\u043b\u0438 \u0438\u043c\u044f";
const PASSWORD_REPEAT_ERROR =
  "\u041f\u0430\u0440\u043e\u043b\u044c \u043d\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0441\u0442\u043e\u044f\u0442\u044c \u0438\u0437 \u043e\u0434\u043d\u043e\u0433\u043e \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u044e\u0449\u0435\u0433\u043e\u0441\u044f \u0441\u0438\u043c\u0432\u043e\u043b\u0430";
const PASSWORD_SEQUENTIAL_ERROR =
  "\u041f\u0430\u0440\u043e\u043b\u044c \u043d\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u043f\u0440\u043e\u0441\u0442\u044b\u0435 \u043f\u043e\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u0438";
const PASSWORD_CONFIRM_MISMATCH_ERROR =
  "\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442.";

const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,23}$/;
const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const DISPLAY_NAME_PATTERN = /^(?=.*[\p{L}\p{N}])[\p{L}\p{N} ._'-]{2,40}$/u;
const LETTER_PATTERN = /\p{L}/u;
const PERSONAL_INFO_SPLIT_PATTERN = /[^\p{L}\p{N}]+/u;
const MIN_PASSWORD_LENGTH = 8;
const COMMON_PASSWORDS = new Set([
  "00000000",
  "11111111",
  "1111111111",
  "11223344",
  "12121212",
  "123123123",
  "123321123",
  "12345678",
  "123456789",
  "1234567890",
  "12345678910",
  "654321",
  "65432100",
  "66666666",
  "77777777",
  "87654321",
  "987654321",
  "abc123456",
  "admin",
  "administrator",
  "admin123",
  "dragon",
  "football",
  "freedom",
  "iloveyou",
  "letmein",
  "login",
  "monkey",
  "passw0rd",
  "password",
  "password1",
  "password123",
  "password123!",
  "princess",
  "qazwsx",
  "qwerty",
  "qwerty123",
  "qwerty123!",
  "qwertyuiop",
  "sunshine",
  "welcome",
  "welcome123",
]);

export type RegistrationValues = {
  username: string;
  email: string;
  displayName: string;
  password: string;
  passwordConfirm: string;
};

export type LoginValues = {
  username: string;
  password: string;
};

export const AUTH_PASSWORD_HELP =
  "\u041c\u0438\u043d\u0438\u043c\u0443\u043c 8 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432, \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u0430 \u0431\u0443\u043a\u0432\u0430. \u041f\u0430\u0440\u043e\u043b\u044c \u043d\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043f\u0440\u043e\u0441\u0442\u044b\u043c, \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c username/\u0438\u043c\u044f \u0438\u043b\u0438 \u043f\u0440\u043e\u0441\u0442\u044b\u0435 \u043f\u043e\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u0438.";

export function validateRequiredField(value: string) {
  return value.trim().length > 0 ? null : REQUIRED_FIELD_ERROR;
}

export function validateRegistrationUsername(value: string) {
  const requiredError = validateRequiredField(value);
  if (requiredError) {
    return requiredError;
  }

  return USERNAME_PATTERN.test(value.trim()) ? null : USERNAME_FORMAT_ERROR;
}

export function validateEmailAddress(value: string) {
  const requiredError = validateRequiredField(value);
  if (requiredError) {
    return requiredError;
  }

  return EMAIL_PATTERN.test(value.trim()) ? null : EMAIL_FORMAT_ERROR;
}

export function validateDisplayName(value: string) {
  const requiredError = validateRequiredField(value);
  if (requiredError) {
    return requiredError;
  }

  return DISPLAY_NAME_PATTERN.test(value.trim()) ? null : DISPLAY_NAME_FORMAT_ERROR;
}

export function validateRegistrationPassword(args: {
  username: string;
  displayName: string;
  password: string;
}) {
  const requiredError = validateRequiredField(args.password);
  if (requiredError) {
    return requiredError;
  }

  if (args.password.length < MIN_PASSWORD_LENGTH) {
    return PASSWORD_MIN_LENGTH_ERROR;
  }
  if (!LETTER_PATTERN.test(args.password)) {
    return PASSWORD_LETTER_ERROR;
  }
  if (COMMON_PASSWORDS.has(args.password.toLowerCase())) {
    return PASSWORD_COMMON_ERROR;
  }
  if (containsPersonalInfo(args.password, args.username, args.displayName)) {
    return PASSWORD_PERSONAL_INFO_ERROR;
  }
  if (isRepeatedCharacterPassword(args.password)) {
    return PASSWORD_REPEAT_ERROR;
  }
  if (hasSequentialPattern(args.password)) {
    return PASSWORD_SEQUENTIAL_ERROR;
  }

  return null;
}

export function validatePasswordConfirmation(password: string, passwordConfirm: string) {
  const requiredError = validateRequiredField(passwordConfirm);
  if (requiredError) {
    return requiredError;
  }

  return password === passwordConfirm ? null : PASSWORD_CONFIRM_MISMATCH_ERROR;
}

export function validateRegistrationForm(values: RegistrationValues) {
  return {
    username: validateRegistrationUsername(values.username),
    email: validateEmailAddress(values.email),
    displayName: validateDisplayName(values.displayName),
    password: validateRegistrationPassword(values),
    passwordConfirm: validatePasswordConfirmation(values.password, values.passwordConfirm),
  };
}

export function isRegistrationFormValid(values: RegistrationValues) {
  const errors = validateRegistrationForm(values);
  return Object.values(errors).every((error) => error === null);
}

export function validateLoginForm(values: LoginValues) {
  return {
    username: validateRequiredField(values.username),
    password: validateRequiredField(values.password),
  };
}

export function isLoginFormValid(values: LoginValues) {
  const errors = validateLoginForm(values);
  return Object.values(errors).every((error) => error === null);
}

function containsPersonalInfo(password: string, username: string, displayName: string) {
  const normalizedPassword = password.toLowerCase();
  return candidateTokens(username, displayName).some((token) => normalizedPassword.includes(token));
}

function candidateTokens(username: string, displayName: string) {
  const tokens = new Set<string>();
  collectToken(tokens, username);
  displayName
    .split(PERSONAL_INFO_SPLIT_PATTERN)
    .forEach((token) => collectToken(tokens, token));
  return Array.from(tokens);
}

function collectToken(tokens: Set<string>, rawValue: string | null | undefined) {
  if (!rawValue) {
    return;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized.length >= 3) {
    tokens.add(normalized);
  }
}

function isRepeatedCharacterPassword(password: string) {
  return new Set(password).size <= 1;
}

function hasSequentialPattern(password: string) {
  const normalized = password.toLowerCase();
  for (let index = 0; index <= normalized.length - 4; index += 1) {
    if (isSequentialChunk(normalized.slice(index, index + 4))) {
      return true;
    }
  }

  return false;
}

function isSequentialChunk(chunk: string) {
  let ascending = true;
  let descending = true;
  for (let index = 1; index < chunk.length; index += 1) {
    const difference = chunk.charCodeAt(index) - chunk.charCodeAt(index - 1);
    ascending &&= difference === 1;
    descending &&= difference === -1;
  }

  return ascending || descending;
}
