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
    expect(validateRequiredField("")).toBe(
      "\u041f\u043e\u043b\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0435 \u0434\u043b\u044f \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f"
    );
  });

  it("rejects invalid emails on blur-style validation", () => {
    expect(validateEmailAddress("north")).toBe(
      "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email"
    );
    expect(validateEmailAddress("north@")).toBe(
      "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email"
    );
    expect(validateEmailAddress("north@example.com")).toBeNull();
  });

  it("matches the backend password policy", () => {
    expect(
      validateRegistrationPassword({
        username: "north",
        displayName: "North User",
        password: "1",
      })
    ).toBe(
      "\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u043c\u0438\u043d\u0438\u043c\u0443\u043c 8 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432"
    );
    expect(
      validateRegistrationPassword({
        username: "north",
        displayName: "North User",
        password: "12345678",
      })
    ).toBe(
      "\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u0443 \u0431\u0443\u043a\u0432\u0443"
    );
    expect(
      validateRegistrationPassword({
        username: "north",
        displayName: "North User",
        password: "Password123!",
      })
    ).toBe(
      "\u041f\u0430\u0440\u043e\u043b\u044c \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043f\u0440\u043e\u0441\u0442\u043e\u0439 \u0438\u043b\u0438 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0440\u0430\u0441\u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0435\u043d\u043d\u044b\u0439"
    );
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
    ).toBe("\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442.");
  });

  it("requires both login fields before enabling submit", () => {
    expect(isLoginFormValid({ username: "", password: "" })).toBe(false);
    expect(isLoginFormValid({ username: "north", password: "riverlantern" })).toBe(true);
  });
});
