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
import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n";
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
  | { kind: "idle"; messageKey: null }
  | { kind: "pending"; messageKey: TranslationKey }
  | { kind: "invalid"; messageKey: TranslationKey }
  | { kind: "expired"; messageKey: TranslationKey }
  | { kind: "alreadyVerified"; messageKey: TranslationKey };

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
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>(
    initialPasswordResetToken
      ? "confirmReset"
      : initialEmailVerificationToken
        ? "verifyEmail"
        : initialEmailChangeToken
          ? "confirmEmailChange"
          : "login"
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
  const [infoMessage, setInfoMessage] = useState<TranslationKey | null>(
    initialPasswordResetToken ? "auth.info.chooseNewPassword" : null
  );
  const [verificationViewState, setVerificationViewState] = useState<VerificationViewState>(() =>
    initialEmailVerificationToken
      ? { kind: "pending", messageKey: "auth.view.checkingVerification" }
      : { kind: "idle", messageKey: null }
  );
  const [emailChangeViewState, setEmailChangeViewState] = useState<VerificationViewState>(() =>
    initialEmailChangeToken
      ? { kind: "pending", messageKey: "auth.view.applyingEmailChange" }
      : { kind: "idle", messageKey: null }
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
      switchMode("login", "auth.info.resetSentIfExists");
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: () => {
      setInfoMessage(null);
      return resendEmailVerification({ email });
    },
    onSuccess: () => {
      switchMode("login", "auth.info.verificationResentIfPossible");
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
      switchMode("login", "auth.info.passwordUpdated");
    },
  });

  const verifyEmailMutation = useMutation({
    mutationFn: (token: string) => confirmEmailVerification({ token }),
    onMutate: () => {
      setVerificationViewState({
        kind: "pending",
        messageKey: "auth.view.checkingVerification",
      });
      setInfoMessage(null);
    },
    onSuccess: () => {
      returnToLogin("auth.info.emailVerified");
    },
    onError: (error) => {
      const nextState = resolveVerificationViewState(error);
      if (nextState.kind === "alreadyVerified") {
        returnToLogin(nextState.messageKey);
        return;
      }

      setVerificationViewState(nextState);
    },
  });

  const confirmEmailChangeMutation = useMutation({
    mutationFn: (token: string) => confirmEmailChange({ token }),
    onMutate: () => {
      setEmailChangeViewState({ kind: "pending", messageKey: "auth.view.applyingEmailChange" });
      setInfoMessage(null);
    },
    onSuccess: () => {
      onEmailChangeHandled?.();
      switchMode("login", "auth.info.emailChanged");
    },
    onError: (error) => {
      const nextState = resolveEmailChangeViewState(error);
      setEmailChangeViewState(nextState);
    },
  });

  function switchMode(nextMode: Mode, nextInfoMessage: TranslationKey | null = null) {
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
    setVerificationViewState({ kind: "idle", messageKey: null });
    setEmailChangeViewState({ kind: "idle", messageKey: null });
    setMode(nextMode);
  }

  useEffect(() => {
    if (!initialPasswordResetToken) {
      return;
    }

    setResetToken(initialPasswordResetToken);
    setResetPassword("");
    switchMode("confirmReset", "auth.info.chooseNewPassword");
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
      messageKey: "auth.view.checkingVerification",
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
    setEmailChangeViewState({ kind: "pending", messageKey: "auth.view.applyingEmailChange" });
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
  const descriptionKey: TranslationKey =
    mode === "requestReset"
      ? "auth.desc.requestReset"
      : mode === "confirmReset"
        ? "auth.desc.confirmReset"
        : mode === "resendVerification"
          ? "auth.desc.resendVerification"
          : mode === "verifyEmail"
            ? "auth.desc.verifyEmail"
            : mode === "confirmEmailChange"
              ? "auth.desc.confirmEmailChange"
              : "auth.desc.default";
  const titleKey: TranslationKey =
    mode === "confirmReset"
      ? "auth.title.resetPassword"
      : mode === "resendVerification" || mode === "verifyEmail"
        ? "auth.title.verifyEmail"
        : mode === "confirmEmailChange"
          ? "auth.title.changeEmail"
          : "auth.title.default";

  function returnToLogin(nextInfoMessage: TranslationKey | null = null) {
    onEmailVerificationHandled?.();
    onEmailChangeHandled?.();
    switchMode("login", nextInfoMessage);
  }

  function openResendVerification() {
    onEmailVerificationHandled?.();
    switchMode("resendVerification", "auth.info.enterEmailForVerification");
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

  function visibleFieldError(
    fieldName: FieldName,
    errorMessage: TranslationKey | null,
  ): TranslationKey | null {
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
        <img className="auth-brand-mark" src="/logo-glow.png?v=20260611a" alt={t("auth.brand")} />
        <div className="eyebrow">{t("auth.brand")}</div>
        <div className="auth-tagline">{t("auth.tagline")}</div>
        {!isAuthMode ? (
          <>
            <h1>{t(titleKey)}</h1>
            <p className="auth-copy">{t(descriptionKey)}</p>
          </>
        ) : null}

        {isAuthMode ? (
          <div className="mode-switch">
            <button
              type="button"
              className={mode === "login" ? "mode-button is-active" : "mode-button"}
              onClick={() => switchMode("login")}
            >
              {t("auth.tab.login")}
            </button>
            <button
              type="button"
              className={mode === "register" ? "mode-button is-active" : "mode-button"}
              onClick={() => switchMode("register")}
            >
              {t("auth.tab.register")}
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
              <span>{mode === "register" ? t("auth.field.username") : t("auth.field.usernameOrEmail")}</span>
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
              {usernameFieldError ? <div className="field-error-text">{t(usernameFieldError)}</div> : null}
            </label>
          )}

          {mode === "register" || mode === "requestReset" || mode === "resendVerification" ? (
            <label className={emailFieldError ? "field is-invalid" : "field"}>
              <span>{t("auth.field.email")}</span>
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
              {emailFieldError ? <div className="field-error-text">{t(emailFieldError)}</div> : null}
            </label>
          ) : null}

          {mode === "register" ? (
            <label className={displayNameFieldError ? "field is-invalid" : "field"}>
              <span>{t("auth.field.displayName")}</span>
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
              {displayNameFieldError ? <div className="field-error-text">{t(displayNameFieldError)}</div> : null}
            </label>
          ) : null}

          {mode === "confirmReset" ? (
            <>
              <label className={resetTokenFieldError ? "field is-invalid" : "field"}>
                <span>{t("auth.field.resetToken")}</span>
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
                {resetTokenFieldError ? <div className="field-error-text">{t(resetTokenFieldError)}</div> : null}
              </label>
              <label className={resetPasswordFieldError ? "field is-invalid" : "field"}>
                <span>{t("auth.field.newPassword")}</span>
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
                <div className="field-help">{t(AUTH_PASSWORD_HELP)}</div>
                {resetPasswordFieldError ? <div className="field-error-text">{t(resetPasswordFieldError)}</div> : null}
              </label>
            </>
          ) : mode === "requestReset" ? null : (
            <>
              <label className={passwordFieldError ? "field is-invalid" : "field"}>
                <span>{t("auth.field.password")}</span>
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
                    labelWhenShown={t("auth.password.hide")}
                    labelWhenHidden={t("auth.password.show")}
                  />
                </div>
                {mode === "register" ? <div className="field-help">{t(AUTH_PASSWORD_HELP)}</div> : null}
                {passwordFieldError ? <div className="field-error-text">{t(passwordFieldError)}</div> : null}
              </label>
              {mode === "register" ? (
                <label className={passwordConfirmFieldError ? "field is-invalid" : "field"}>
                  <span>{t("auth.field.passwordConfirm")}</span>
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
                      labelWhenShown={t("auth.password.hideConfirm")}
                      labelWhenHidden={t("auth.password.showConfirm")}
                    />
                  </div>
                  {passwordConfirmFieldError ? (
                    <div className="field-error-text">{t(passwordConfirmFieldError)}</div>
                  ) : null}
                </label>
              ) : null}
            </>
          )}

          {infoMessage ? <div className="form-note">{t(infoMessage)}</div> : null}

          {mode === "verifyEmail" && verificationViewState.messageKey ? (
            <div
              className={
                verificationViewState.kind === "invalid" || verificationViewState.kind === "expired"
                  ? "form-error"
                  : "form-note"
              }
            >
              {t(verificationViewState.messageKey)}
            </div>
          ) : null}

          {mode === "confirmEmailChange" && emailChangeViewState.messageKey ? (
            <div
              className={
                emailChangeViewState.kind === "invalid" || emailChangeViewState.kind === "expired"
                  ? "form-error"
                  : "form-note"
              }
            >
              {t(emailChangeViewState.messageKey)}
            </div>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}

          {mode === "verifyEmail" || mode === "confirmEmailChange" ? null : (
            <button type="submit" className="primary-button" disabled={isBusy || !canSubmit}>
              {mode === "requestReset"
                ? requestResetMutation.isPending
                  ? t("auth.button.sendingLink")
                  : t("auth.button.sendResetLink")
                : mode === "resendVerification"
                  ? resendVerificationMutation.isPending
                    ? t("auth.button.sendingLink")
                    : t("auth.button.sendVerification")
                  : mode === "confirmReset"
                    ? confirmResetMutation.isPending
                      ? t("auth.button.updatingPassword")
                      : t("auth.button.resetPassword")
                    : authMutation.isPending
                      ? t("auth.button.connecting")
                      : mode === "register"
                        ? t("auth.button.createAccount")
                        : t("auth.button.login")}
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
                {t("auth.button.forgotPassword")}
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
              {t("auth.button.backToLogin")}
            </button>
          ) : null}

          {mode === "resendVerification" ? (
            <button
              type="button"
              className="ghost-button auth-secondary-button"
              onClick={() => switchMode("login")}
              disabled={isBusy}
            >
              {t("auth.button.back")}
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
                  {t("auth.button.sendVerification")}
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
                {t("auth.button.backToLogin")}
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
              {t("auth.button.backToLogin")}
            </button>
          ) : null}
        </form>
      </section>
      <div className="auth-pillars">
        <div className="auth-pillar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 19c0-3 2.6-4.8 5.5-4.8s5.5 1.8 5.5 4.8" />
            <path d="M16.6 6.2a2.6 2.6 0 0 1 0 5" />
            <path d="M17 14.4c2.4.3 4 2 4 4.6" />
          </svg>
          <span className="auth-pillar-label">{t("auth.pillar.people")}</span>
        </div>
        <div className="auth-pillar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5.2a2.6 2.6 0 0 0-4.5 1.5 2.4 2.4 0 0 0-1.9 2.6 2.4 2.4 0 0 0 .7 1.6 2.4 2.4 0 0 0 .5 3.1 2.4 2.4 0 0 0 2.6 1.8c.5.7 1.3 1.1 2.1 1.1" />
            <path d="M12 5.2a2.6 2.6 0 0 1 4.5 1.5 2.4 2.4 0 0 1 1.9 2.6 2.4 2.4 0 0 1-.7 1.6 2.4 2.4 0 0 1-.5 3.1 2.4 2.4 0 0 1-2.6 1.8c-.5.7-1.3 1.1-2.1 1.1" />
            <path d="M12 5.2V17" />
          </svg>
          <span className="auth-pillar-label">{t("auth.pillar.ai")}</span>
        </div>
        <div className="auth-pillar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2.5l8.5 4.8v9.4L12 21.5 3.5 16.7V7.3z" />
            <path d="M3.7 7.2 12 12l8.3-4.8M12 12v9.3" />
          </svg>
          <span className="auth-pillar-label">{t("auth.pillar.services")}</span>
        </div>
        <div className="auth-pillar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2.5c3.2 2.2 4.8 5.6 4.8 9.4l-2.4 2.6H9.6L7.2 11.9C7.2 8.1 8.8 4.7 12 2.5z" />
            <circle cx="12" cy="9.4" r="1.6" />
            <path d="M9.4 15.6l-2 4.1M14.6 15.6l2 4.1M12 14.6v4" />
          </svg>
          <span className="auth-pillar-label">{t("auth.pillar.startups")}</span>
        </div>
      </div>
    </main>
  );
}

function resolveEmailChangeViewState(error: unknown): VerificationViewState {
  if (error instanceof ApiError) {
    if (error.status === 410) {
      return { kind: "expired", messageKey: "auth.view.emailChangeExpired" };
    }
    if (error.status === 409) {
      return { kind: "invalid", messageKey: "auth.view.emailInUse" };
    }
  }
  return { kind: "invalid", messageKey: "auth.view.emailChangeInvalid" };
}

function resolveVerificationViewState(error: unknown): VerificationViewState {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.message === "Email is already verified") {
      return {
        kind: "alreadyVerified",
        messageKey: "auth.view.alreadyVerified",
      };
    }
    if (error.status === 410 && error.message === "Email verification token is expired") {
      return {
        kind: "expired",
        messageKey: "auth.view.verificationExpired",
      };
    }
  }

  return {
    kind: "invalid",
    messageKey: "auth.view.verificationInvalid",
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
