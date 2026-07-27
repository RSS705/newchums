import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Mustache from "mustache";
import { generateOtpCode, parseSignupIntent, PLAN_SIGNUP_OTP_MAX_ATTEMPTS } from "../planSignupOtp";
import { SUBJECTS } from "../../email/subjects";

describe("generateOtpCode", () => {
  it("always returns exactly six digits", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  it("preserves leading zeros as characters", () => {
    const codes = Array.from({ length: 500 }, () => generateOtpCode());
    expect(codes.every((c) => c.length === 6)).toBe(true);
  });

  it("is not constant", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("parseSignupIntent", () => {
  it("accepts the two valid intents", () => {
    expect(parseSignupIntent("going")).toBe("going");
    expect(parseSignupIntent("maybe")).toBe("maybe");
  });

  it("rejects everything else", () => {
    expect(parseSignupIntent("cant_make_it")).toBeNull();
    expect(parseSignupIntent("")).toBeNull();
    expect(parseSignupIntent(undefined)).toBeNull();
    expect(parseSignupIntent(null)).toBeNull();
    expect(parseSignupIntent(42)).toBeNull();
    expect(parseSignupIntent("GOING")).toBeNull();
  });
});

describe("attempt cap constant", () => {
  it("matches the documented five-guess cap", () => {
    expect(PLAN_SIGNUP_OTP_MAX_ATTEMPTS).toBe(5);
  });
});

describe("magicLinkSignup template (code + link email)", () => {
  const templatesDir = join(__dirname, "..", "..", "email", "templates");
  const html = readFileSync(join(templatesDir, "magicLinkSignup.html"), "utf8");
  const text = readFileSync(join(templatesDir, "magicLinkSignup.txt"), "utf8");
  const model = {
    otpCode: "042137",
    confirmUrl: "https://newchums.com/auth/magic?token=abc&email=x%40y.z&next=%2Fevents%2F123",
    planTitle: "Tuesday Board Games",
    year: "2026",
    productName: "NewChums",
  };

  it("renders the code and the magic link in both bodies", () => {
    const renderedHtml = Mustache.render(html, model);
    const renderedText = Mustache.render(text, model, undefined, { escape: (v: string) => v });
    for (const rendered of [renderedHtml, renderedText]) {
      expect(rendered).toContain("042137");
      expect(rendered).toContain(model.planTitle);
      expect(rendered).toContain("10 minutes");
    }
    // Mustache HTML-escapes the URL in the HTML body (matching production
    // renderEmail); the plain-text body carries it verbatim.
    expect(renderedHtml).toContain(`href="${Mustache.escape(model.confirmUrl)}"`);
    expect(renderedText).toContain(model.confirmUrl);
  });

  it("puts the code in the subject line", () => {
    const subject = Mustache.render(SUBJECTS.magicLinkSignup, model, undefined, {
      escape: (v: string) => v,
    });
    expect(subject).toBe("042137 is your NewChums code");
  });

  it("contains no em dashes in user-facing output", () => {
    // The em dash is constructed at runtime so this test file itself
    // complies with the repo-wide ban on the character.
    const emDash = String.fromCharCode(0x2014);
    const renderedHtml = Mustache.render(html, model);
    const renderedText = Mustache.render(text, model, undefined, { escape: (v: string) => v });
    expect(renderedHtml).not.toContain(emDash);
    expect(renderedText).not.toContain(emDash);
  });
});
