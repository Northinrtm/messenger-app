import { describe, expect, it } from "vitest";
import {
  isLoginFormValid,
  isRegistrationFormValid,
  validateEmailAddress,
  validateRegistrationForm,
  validateRegistrationPassword,
  validateRequiredField,
} from "./authValidation";

describe("authValidation", () => {
  it("requires mandatory fields", () => {
    expect(validateRequiredField("")).toBe("auth.validation.required");
  });

  it("rejects invalid emails on blur-style validation", () => {
    expect(validateEmailAddress("north")).toBe("auth.validation.emailFormat");
    expect(validateEmailAddress("north@")).toBe("auth.validation.emailFormat");
    expect(validateEmailAddress("north@example.com")).toBeNull();
  });

  it("matches the backend password policy", () => {
    expect(
      validateRegistrationPassword({
        username: "north",
        displayName: "North User",
        password: "1",
      })
    ).toBe("auth.validation.passwordMinLength");
    expect(
      validateRegistrationPassword({
        username: "north",
        displayName: "North User",
        password: "12345678",
      })
    ).toBe("auth.validation.passwordLetter");
    expect(
      validateRegistrationPassword({
        username: "north",
        displayName: "North User",
        password: "Password123!",
      })
    ).toBe("auth.validation.passwordCommon");
    expect(
      validateRegistrationPassword({
        username: "north",
        displayName: "North User",
        password: "riverlantern",
      })
    ).toBeNull();
  });

  it("validates the full registration form consistently", () => {
    expect(
      isRegistrationFormValid({
        username: "north",
        email: "north@example.com",
        displayName: "North",
        password: "riverlantern",
        passwordConfirm: "riverlantern",
      })
    ).toBe(true);

    expect(
      validateRegistrationForm({
        username: "north",
        email: "north@example.com",
        displayName: "North",
        password: "riverlantern",
        passwordConfirm: "wrong",
      }).passwordConfirm
    ).toBe("auth.validation.passwordMismatch");
  });

  it("requires both login fields before enabling submit", () => {
    expect(isLoginFormValid({ username: "", password: "" })).toBe(false);
    expect(isLoginFormValid({ username: "north", password: "riverlantern" })).toBe(true);
  });
});
