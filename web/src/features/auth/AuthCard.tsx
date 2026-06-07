import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  confirmEmailChange,
  confirmEmailVerification,
  confirmPasswordReset,
  describeError,
  login,
  register,
  requestPasswordReset,
  resendEmailVerification,
} from "../../lib/api";
import type { AuthResponse } from "../../lib/types";
import {
  AUTH_PASSWORD_HELP,
  isLoginFormValid,
  isRegistrationFormValid,
  validateEmailAddress,
  validateLoginForm,
  validateRegistrationForm,
  validateRegistrationPassword,
  validateRequiredField,
} from "./authValidation";

type Props = {
  onAuthenticated: (response: AuthResponse) => void;
  initialPasswordResetToken?: string | null;
  onPasswordResetHandled?: () => void;
  initialEmailVerificationToken?: string | null;
  onEmailVerificationHandled?: () => void;
  initialEmailChangeToken?: string | null;
  onEmailChangeHandled?: () => void;
};

type Mode =
  | "login"
  | "register"
  | "requestReset"
  | "confirmReset"
  | "resendVerification"
  | "verifyEmail"
  | "confirmEmailChange";

type VerificationViewState =
  | { kind: "idle"; message: null }
  | { kind: "pending"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "expired"; message: string }
  | { kind: "alreadyVerified"; message: string };

type FieldName =
  | "username"
  | "email"
  | "displayName"
  | "password"
  | "passwordConfirm"
  | "resetToken"
  | "resetPassword";

export function AuthCard({
  onAuthenticated,
  initialPasswordResetToken = null,
  onPasswordResetHandled,
  initialEmailVerificationToken = null,
  onEmailVerificationHandled,
  initialEmailChangeToken = null,
  onEmailChangeHandled,
}: Props) {
  const [mode, setMode] = useState<Mode>(
    initialPasswordResetToken
      ? "confirmReset"
      : initialEmailVerificationToken
        ? "verifyEmail"
        : initialEmailChangeToken
          ? "confirmEmailChange"
          : "register"
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [resetToken, setResetToken] = useState(initialPasswordResetToken ?? "");
  const [resetPassword, setResetPassword] = useState("");
  const [touchedFields, setTouchedFields] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(
    initialPasswordResetToken ? "Выберите новый пароль для этой ссылки сброса." : null
  );
  const [verificationViewState, setVerificationViewState] = useState<VerificationViewState>(() =>
    initialEmailVerificationToken
      ? { kind: "pending", message: "Проверяем вашу ссылку подтверждения." }
      : { kind: "idle", message: null }
  );
  const [emailChangeViewState, setEmailChangeViewState] = useState<VerificationViewState>(() =>
    initialEmailChangeToken
      ? { kind: "pending", message: "Применяем смену почты." }
      : { kind: "idle", message: null }
  );
  const verifiedTokenRef = useRef<string | null>(null);
  const emailChangeTokenRef = useRef<string | null>(null);

  const authMutation = useMutation<AuthResponse>({
    mutationFn: async () => {
      setInfoMessage(null);
      if (mode === "register") {
        return register({ username, email, displayName, password });
      }

      return login({ username, password });
    },
    onSuccess: (response) => {
      setPassword("");
      setPasswordConfirm("");
      onAuthenticated(response);
    },
  });

  const requestResetMutation = useMutation({
    mutationFn: () => {
      setInfoMessage(null);
      return requestPasswordReset({ email });
    },
    onSuccess: () => {
      switchMode("login", "Если такая почта существует, инструкции по сбросу отправлены.");
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: () => {
      setInfoMessage(null);
      return resendEmailVerification({ email });
    },
    onSuccess: () => {
      switchMode("login", "Если почту можно подтвердить, новая ссылка отправлена.");
    },
  });

  const confirmResetMutation = useMutation({
    mutationFn: () => {
      setInfoMessage(null);
      return confirmPasswordReset({ token: resetToken, newPassword: resetPassword });
    },
    onSuccess: () => {
      setResetPassword("");
      setResetToken("");
      onPasswordResetHandled?.();
      switchMode("login", "Пароль обновлён. Войдите с новым паролем.");
    },
  });

  const verifyEmailMutation = useMutation({
    mutationFn: (token: string) => confirmEmailVerification({ token }),
    onMutate: () => {
      setVerificationViewState({
        kind: "pending",
        message: "Проверяем вашу ссылку подтверждения.",
      });
      setInfoMessage(null);
    },
    onSuccess: () => {
      returnToLogin("Почта подтверждена. Войдите, чтобы продолжить.");
    },
    onError: (error) => {
      const nextState = resolveVerificationViewState(error);
      if (nextState.kind === "alreadyVerified") {
        returnToLogin(nextState.message);
        return;
      }

      setVerificationViewState(nextState);
    },
  });

  const confirmEmailChangeMutation = useMutation({
    mutationFn: (token: string) => confirmEmailChange({ token }),
    onMutate: () => {
      setEmailChangeViewState({ kind: "pending", message: "Применяем смену почты." });
      setInfoMessage(null);
    },
    onSuccess: () => {
      onEmailChangeHandled?.();
      switchMode("login", "Адрес почты обновлён. Войдите, чтобы продолжить.");
    },
    onError: (error) => {
      const nextState = resolveEmailChangeViewState(error);
      setEmailChangeViewState(nextState);
    },
  });

  function switchMode(nextMode: Mode, nextInfoMessage: string | null = null) {
    authMutation.reset();
    requestResetMutation.reset();
    resendVerificationMutation.reset();
    confirmResetMutation.reset();
    verifyEmailMutation.reset();
    confirmEmailChangeMutation.reset();
    setTouchedFields({});
    setSubmitAttempted(false);
    setShowPassword(false);
    setShowPasswordConfirm(false);
    setInfoMessage(nextInfoMessage);
    setVerificationViewState({ kind: "idle", message: null });
    setEmailChangeViewState({ kind: "idle", message: null });
    setMode(nextMode);
  }

  useEffect(() => {
    if (!initialPasswordResetToken) {
      return;
    }

    setResetToken(initialPasswordResetToken);
    setResetPassword("");
    switchMode("confirmReset", "Выберите новый пароль для этой ссылки сброса.");
  }, [initialPasswordResetToken]);

  useEffect(() => {
    if (initialEmailVerificationToken) {
      return;
    }

    verifiedTokenRef.current = null;
  }, [initialEmailVerificationToken]);

  useEffect(() => {
    if (initialEmailChangeToken) {
      return;
    }

    emailChangeTokenRef.current = null;
  }, [initialEmailChangeToken]);

  useEffect(() => {
    if (!initialEmailVerificationToken) {
      return;
    }
    if (verifiedTokenRef.current === initialEmailVerificationToken) {
      return;
    }

    verifiedTokenRef.current = initialEmailVerificationToken;
    authMutation.reset();
    requestResetMutation.reset();
    resendVerificationMutation.reset();
    confirmResetMutation.reset();
    verifyEmailMutation.reset();
    setInfoMessage(null);
    setMode("verifyEmail");
    setVerificationViewState({
      kind: "pending",
      message: "Проверяем вашу ссылку подтверждения.",
    });
    verifyEmailMutation.mutate(initialEmailVerificationToken);
  }, [
    authMutation,
    confirmResetMutation,
    initialEmailVerificationToken,
    requestResetMutation,
    resendVerificationMutation,
    verifyEmailMutation,
  ]);

  useEffect(() => {
    if (!initialEmailChangeToken) {
      return;
    }
    if (emailChangeTokenRef.current === initialEmailChangeToken) {
      return;
    }

    emailChangeTokenRef.current = initialEmailChangeToken;
    authMutation.reset();
    requestResetMutation.reset();
    resendVerificationMutation.reset();
    confirmResetMutation.reset();
    verifyEmailMutation.reset();
    confirmEmailChangeMutation.reset();
    setInfoMessage(null);
    setMode("confirmEmailChange");
    setEmailChangeViewState({ kind: "pending", message: "Применяем смену почты." });
    confirmEmailChangeMutation.mutate(initialEmailChangeToken);
  }, [
    authMutation,
    confirmEmailChangeMutation,
    confirmResetMutation,
    initialEmailChangeToken,
    requestResetMutation,
    resendVerificationMutation,
    verifyEmailMutation,
  ]);

  const error = [authMutation.error, requestResetMutation.error, resendVerificationMutation.error, confirmResetMutation.error]
    .filter(Boolean)
    .map((item) => describeError(item))
    .find(Boolean);
  const registrationValues = {
    username,
    email,
    displayName,
    password,
    passwordConfirm,
  };
  const registrationErrors = validateRegistrationForm(registrationValues);
  const loginErrors = validateLoginForm({ username, password });
  const requestResetEmailError = validateEmailAddress(email);
  const resendVerificationEmailError = validateEmailAddress(email);
  const confirmResetTokenError = validateRequiredField(resetToken);
  const confirmResetPasswordError = validateRegistrationPassword({
    username: "",
    displayName: "",
    password: resetPassword,
  });
  const isAuthMode = mode === "login" || mode === "register";
  const canSubmit =
    mode === "register"
      ? isRegistrationFormValid(registrationValues)
      : mode === "login"
        ? isLoginFormValid({ username, password })
        : mode === "requestReset"
          ? requestResetEmailError === null
          : mode === "resendVerification"
            ? resendVerificationEmailError === null
            : mode === "confirmReset"
              ? confirmResetTokenError === null && confirmResetPasswordError === null
              : false; // verifyEmail and confirmEmailChange have no user-submit action
  const isBusy =
    authMutation.isPending ||
    requestResetMutation.isPending ||
    resendVerificationMutation.isPending ||
    confirmResetMutation.isPending ||
    verifyEmailMutation.isPending ||
    confirmEmailChangeMutation.isPending;
  const description =
    mode === "requestReset"
      ? "Укажите почту, привязанную к аккаунту. Если она существует, ссылка для сброса придёт туда."
      : mode === "confirmReset"
        ? "Задайте новый пароль для аккаунта. Ссылку можно использовать только один раз."
        : mode === "resendVerification"
          ? "Укажите почту, использованную при регистрации. Если её можно подтвердить, новая ссылка придёт туда."
          : mode === "verifyEmail"
            ? "Подтверждаем ссылку проверки почты для вашего аккаунта."
            : mode === "confirmEmailChange"
              ? "Применяем смену адреса почты для вашего аккаунта."
              : "Java-бэкенд, типизированный веб-клиент, личные диалоги и доставка сообщений в реальном времени.";
  const title =
    mode === "confirmReset"
      ? "Сброс пароля."
      : mode === "resendVerification" || mode === "verifyEmail"
        ? "Подтверждение почты."
        : mode === "confirmEmailChange"
          ? "Смена почты."
          : "Мессенджер реального времени для серьёзных продуктов.";

  function returnToLogin(nextInfoMessage: string | null = null) {
    onEmailVerificationHandled?.();
    onEmailChangeHandled?.();
    switchMode("login", nextInfoMessage);
  }

  function openResendVerification() {
    onEmailVerificationHandled?.();
    switchMode("resendVerification", "Укажите почту, чтобы получить новую ссылку подтверждения.");
  }

  function touchField(fieldName: FieldName) {
    setTouchedFields((current) => (current[fieldName] ? current : { ...current, [fieldName]: true }));
  }

  function touchFields(fieldNames: FieldName[]) {
    setTouchedFields((current) => {
      let next = current;
      fieldNames.forEach((fieldName) => {
        if (!next[fieldName]) {
          next = { ...next, [fieldName]: true };
        }
      });
      return next;
    });
  }

  function visibleFieldError(fieldName: FieldName, errorMessage: string | null) {
    if (!errorMessage) {
      return null;
    }

    return submitAttempted || touchedFields[fieldName] ? errorMessage : null;
  }

  const usernameFieldError =
    mode === "register"
      ? visibleFieldError("username", registrationErrors.username)
      : mode === "login"
        ? visibleFieldError("username", loginErrors.username)
        : null;
  const emailFieldError =
    mode === "register"
      ? visibleFieldError("email", registrationErrors.email)
      : mode === "requestReset"
        ? visibleFieldError("email", requestResetEmailError)
        : mode === "resendVerification"
          ? visibleFieldError("email", resendVerificationEmailError)
          : null;
  const displayNameFieldError =
    mode === "register" ? visibleFieldError("displayName", registrationErrors.displayName) : null;
  const passwordFieldError =
    mode === "register"
      ? visibleFieldError("password", registrationErrors.password)
      : mode === "login"
        ? visibleFieldError("password", loginErrors.password)
        : null;
  const passwordConfirmFieldError =
    mode === "register"
      ? visibleFieldError("passwordConfirm", registrationErrors.passwordConfirm)
      : null;
  const resetTokenFieldError =
    mode === "confirmReset" ? visibleFieldError("resetToken", confirmResetTokenError) : null;
  const resetPasswordFieldError =
    mode === "confirmReset" ? visibleFieldError("resetPassword", confirmResetPasswordError) : null;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img className="auth-brand-mark" src="/logo-mark.svg?v=20260408d" alt="North Messenger" />
        <div className="eyebrow">North Messenger</div>
        {!isAuthMode ? (
          <>
            <h1>{title}</h1>
            <p className="auth-copy">{description}</p>
          </>
        ) : null}

        {isAuthMode ? (
          <div className="mode-switch">
            <button
              type="button"
              className={mode === "register" ? "mode-button is-active" : "mode-button"}
              onClick={() => switchMode("register")}
            >
              Регистрация
            </button>
            <button
              type="button"
              className={mode === "login" ? "mode-button is-active" : "mode-button"}
              onClick={() => switchMode("login")}
            >
              Войти
            </button>
          </div>
        ) : null}

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitAttempted(true);
            if (mode === "requestReset") {
              touchFields(["email"]);
              if (requestResetEmailError) {
                return;
              }
              requestResetMutation.mutate();
              return;
            }
            if (mode === "resendVerification") {
              touchFields(["email"]);
              if (resendVerificationEmailError) {
                return;
              }
              resendVerificationMutation.mutate();
              return;
            }
            if (mode === "confirmReset") {
              touchFields(["resetToken", "resetPassword"]);
              if (confirmResetTokenError || confirmResetPasswordError) {
                return;
              }
              confirmResetMutation.mutate();
              return;
            }
            if (mode === "verifyEmail") {
              return;
            }
            if (mode === "register") {
              touchFields(["username", "email", "displayName", "password", "passwordConfirm"]);
              if (!isRegistrationFormValid(registrationValues)) {
                return;
              }
            } else {
              touchFields(["username", "password"]);
              if (!isLoginFormValid({ username, password })) {
                return;
              }
            }
            if (!canSubmit) {
              return;
            }
            authMutation.mutate();
          }}
        >
          {mode === "requestReset" ||
          mode === "confirmReset" ||
          mode === "resendVerification" ||
          mode === "verifyEmail" ||
          mode === "confirmEmailChange" ? null : (
            <label className={usernameFieldError ? "field is-invalid" : "field"}>
              <span>{mode === "register" ? "Юзернейм" : "Юзернейм или почта"}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                onBlur={() => touchField("username")}
                placeholder=""
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={usernameFieldError ? "true" : undefined}
                required
              />
              {usernameFieldError ? <div className="field-error-text">{usernameFieldError}</div> : null}
            </label>
          )}

          {mode === "register" || mode === "requestReset" || mode === "resendVerification" ? (
            <label className={emailFieldError ? "field is-invalid" : "field"}>
              <span>Почта</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => touchField("email")}
                placeholder=""
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={emailFieldError ? "true" : undefined}
                required
              />
              {emailFieldError ? <div className="field-error-text">{emailFieldError}</div> : null}
            </label>
          ) : null}

          {mode === "register" ? (
            <label className={displayNameFieldError ? "field is-invalid" : "field"}>
              <span>Отображаемое имя</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onBlur={() => touchField("displayName")}
                placeholder=""
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={displayNameFieldError ? "true" : undefined}
                required
              />
              {displayNameFieldError ? <div className="field-error-text">{displayNameFieldError}</div> : null}
            </label>
          ) : null}

          {mode === "confirmReset" ? (
            <>
              <label className={resetTokenFieldError ? "field is-invalid" : "field"}>
                <span>Токен сброса</span>
                <input
                  value={resetToken}
                  onChange={(event) => setResetToken(event.target.value)}
                  onBlur={() => touchField("resetToken")}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={resetTokenFieldError ? "true" : undefined}
                  required
                />
                {resetTokenFieldError ? <div className="field-error-text">{resetTokenFieldError}</div> : null}
              </label>
              <label className={resetPasswordFieldError ? "field is-invalid" : "field"}>
                <span>Новый пароль</span>
                <input
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  onBlur={() => touchField("resetPassword")}
                  placeholder=""
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={resetPasswordFieldError ? "true" : undefined}
                  required
                />
                <div className="field-help">{AUTH_PASSWORD_HELP}</div>
                {resetPasswordFieldError ? <div className="field-error-text">{resetPasswordFieldError}</div> : null}
              </label>
            </>
          ) : mode === "requestReset" ? null : (
            <>
              <label className={passwordFieldError ? "field is-invalid" : "field"}>
                <span>Пароль</span>
                <div className="field-input">
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onBlur={() => touchField("password")}
                    placeholder=""
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    aria-invalid={passwordFieldError ? "true" : undefined}
                    required
                  />
                  <PasswordVisibilityButton
                    shown={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                    labelWhenShown="Скрыть пароль"
                    labelWhenHidden="Показать пароль"
                  />
                </div>
                {mode === "register" ? <div className="field-help">{AUTH_PASSWORD_HELP}</div> : null}
                {passwordFieldError ? <div className="field-error-text">{passwordFieldError}</div> : null}
              </label>
              {mode === "register" ? (
                <label className={passwordConfirmFieldError ? "field is-invalid" : "field"}>
                  <span>Повторите пароль</span>
                  <div className="field-input">
                    <input
                      value={passwordConfirm}
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                      onBlur={() => touchField("passwordConfirm")}
                      placeholder=""
                      type={showPasswordConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      aria-invalid={passwordConfirmFieldError ? "true" : undefined}
                      required
                    />
                    <PasswordVisibilityButton
                      shown={showPasswordConfirm}
                      onClick={() => setShowPasswordConfirm((current) => !current)}
                      labelWhenShown="Скрыть подтверждение пароля"
                      labelWhenHidden="Показать подтверждение пароля"
                    />
                  </div>
                  {passwordConfirmFieldError ? (
                    <div className="field-error-text">{passwordConfirmFieldError}</div>
                  ) : null}
                </label>
              ) : null}
            </>
          )}

          {infoMessage ? <div className="form-note">{infoMessage}</div> : null}

          {mode === "verifyEmail" && verificationViewState.message ? (
            <div
              className={
                verificationViewState.kind === "invalid" || verificationViewState.kind === "expired"
                  ? "form-error"
                  : "form-note"
              }
            >
              {verificationViewState.message}
            </div>
          ) : null}

          {mode === "confirmEmailChange" && emailChangeViewState.message ? (
            <div
              className={
                emailChangeViewState.kind === "invalid" || emailChangeViewState.kind === "expired"
                  ? "form-error"
                  : "form-note"
              }
            >
              {emailChangeViewState.message}
            </div>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}

          {mode === "verifyEmail" || mode === "confirmEmailChange" ? null : (
            <button type="submit" className="primary-button" disabled={isBusy || !canSubmit}>
              {mode === "requestReset"
                ? requestResetMutation.isPending
                  ? "Отправляем ссылку…"
                  : "Отправить ссылку для сброса"
                : mode === "resendVerification"
                  ? resendVerificationMutation.isPending
                    ? "Отправляем ссылку…"
                    : "Отправить письмо подтверждения"
                  : mode === "confirmReset"
                    ? confirmResetMutation.isPending
                      ? "Обновляем пароль…"
                      : "Сбросить пароль"
                    : authMutation.isPending
                      ? "Подключение…"
                      : mode === "register"
                        ? "Создать аккаунт"
                        : "Войти"}
            </button>
          )}

          {mode === "login" ? (
            <>
              <button
                type="button"
                className="ghost-button auth-secondary-button"
                onClick={() => switchMode("requestReset")}
                disabled={isBusy}
              >
                Забыли пароль?
              </button>
            </>
          ) : null}

          {mode === "requestReset" || mode === "confirmReset" ? (
            <button
              type="button"
              className="ghost-button auth-secondary-button"
              onClick={() => {
                setResetPassword("");
                if (mode === "confirmReset") {
                  setResetToken("");
                  onPasswordResetHandled?.();
                }
                switchMode("login");
              }}
              disabled={isBusy}
            >
              Назад ко входу
            </button>
          ) : null}

          {mode === "resendVerification" ? (
            <button
              type="button"
              className="ghost-button auth-secondary-button"
              onClick={() => switchMode("login")}
              disabled={isBusy}
            >
              Назад
            </button>
          ) : null}

          {mode === "verifyEmail" ? (
            <>
              {verificationViewState.kind === "invalid" || verificationViewState.kind === "expired" ? (
                <button
                  type="button"
                  className="ghost-button auth-secondary-button"
                  onClick={openResendVerification}
                  disabled={isBusy}
                >
                  Отправить письмо подтверждения
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button auth-secondary-button"
                onClick={() => {
                  returnToLogin();
                }}
                disabled={isBusy}
              >
                Назад ко входу
              </button>
            </>
          ) : null}

          {mode === "confirmEmailChange" ? (
            <button
              type="button"
              className="ghost-button auth-secondary-button"
              onClick={() => returnToLogin()}
              disabled={isBusy}
            >
              Назад ко входу
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}

function resolveEmailChangeViewState(error: unknown): VerificationViewState {
  if (error instanceof ApiError) {
    if (error.status === 410) {
      return { kind: "expired", message: "Ссылка для смены почты истекла. Запросите новую в настройках профиля." };
    }
    if (error.status === 409) {
      return { kind: "invalid", message: "Этот адрес почты уже используется другим аккаунтом." };
    }
  }
  return { kind: "invalid", message: "Ссылка для смены почты недействительна или уже использована." };
}

function resolveVerificationViewState(error: unknown): VerificationViewState {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.message === "Email is already verified") {
      return {
        kind: "alreadyVerified",
        message: "Эта почта уже подтверждена. Можно войти.",
      };
    }
    if (error.status === 410 && error.message === "Email verification token is expired") {
      return {
        kind: "expired",
        message: "Ссылка подтверждения истекла. Запросите новую, чтобы продолжить.",
      };
    }
  }

  return {
    kind: "invalid",
    message: "Ссылка подтверждения недействительна. Запросите новую ссылку подтверждения почты.",
  };
}

function PasswordVisibilityButton({
  shown,
  onClick,
  labelWhenShown,
  labelWhenHidden,
}: {
  shown: boolean;
  onClick: () => void;
  labelWhenShown: string;
  labelWhenHidden: string;
}) {
  return (
    <button
      type="button"
      className="password-visibility-button"
      aria-label={shown ? labelWhenShown : labelWhenHidden}
      onClick={onClick}
    >
      {shown ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M3 4.5 19.5 21"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="M10.6 6.2c.45-.12.92-.2 1.4-.2 5.24 0 9.5 5.5 9.5 6s-1.1 1.9-2.95 3.24M6.2 9.1C3.98 10.65 2.5 12.45 2.5 13c0 .5 4.26 6 9.5 6 1.58 0 3.08-.5 4.4-1.25"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="M9.8 9.82A3.2 3.2 0 0 1 15 12.4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="M14.17 14.19A3.2 3.2 0 0 1 9.4 9.42"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M2.5 12c0-.5 4.26-6 9.5-6s9.5 5.5 9.5 6-4.26 6-9.5 6-9.5-5.5-9.5-6Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <circle
            cx="12"
            cy="12"
            r="3.2"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      )}
    </button>
  );
}
