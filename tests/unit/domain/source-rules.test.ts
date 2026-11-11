import { describe, expect, it } from "vitest";
import { BRACKET_PATTERN, extractSubjectPassword, redactSubjectPassword, validatePasswordPattern } from "@/domain/value-objects/password-rule";
import { periodKeyFor, periodRange, resolvePeriod } from "@/domain/value-objects/period";
import { extractAddress, matchesMessage, parseSender, senderMatches, type MessageSummary, type SourceMatcher } from "@/domain/value-objects/source-rules";

const msg = (over: Partial<MessageSummary> = {}): MessageSummary => ({
  id: "1", from: "Jio Billing <Billing@Jio.com>", subject: "Your Jio bill (abc123)", date: new Date("2026-11-05T00:00:00Z"),
  attachments: [{ name: "Bill-Nov.pdf", size: 10 }], ...over,
});
const rules = (over: Partial<SourceMatcher> = {}): SourceMatcher => ({ senders: ["@jio.com"], subjectContains: null, attachmentNameContains: null, requireAttachment: true, ...over });

describe("sender rules", () => {
  it("accepts addresses and domains in any case, rejects everything else", () => {
    expect(parseSender(" Billing@Jio.com ")).toBe("billing@jio.com");
    expect(parseSender("jio.com")).toBe("@jio.com");
    expect(parseSender("@Jio.com")).toBe("@jio.com");
    for (const bad of ["", "jio", "not an email", "a@b", "<x@y.com>", "x".repeat(300) + "@a.com"]) expect(parseSender(bad), bad).toBeNull();
  });
  it("reads the address out of a display name", () => {
    expect(extractAddress("Jio Billing <Billing@Jio.com>")).toBe("billing@jio.com");
    expect(extractAddress("plain@x.com")).toBe("plain@x.com");
  });
  it("matches a domain rule on the domain and its subdomains, never on look-alikes", () => {
    expect(senderMatches("@jio.com", "a@jio.com")).toBe(true);
    expect(senderMatches("@jio.com", "a@mail.jio.com")).toBe(true);
    expect(senderMatches("@jio.com", "a@notjio.com")).toBe(false);
    expect(senderMatches("@jio.com", "a@jio.com.evil.example")).toBe(false);
    expect(senderMatches("a@jio.com", "a@jio.com")).toBe(true);
    expect(senderMatches("a@jio.com", "b@jio.com")).toBe(false);
  });
});

describe("matchesMessage", () => {
  it("requires every present rule", () => {
    expect(matchesMessage(rules(), msg())).toBe(true);
    expect(matchesMessage(rules({ senders: ["@other.com"] }), msg())).toBe(false);
    expect(matchesMessage(rules({ subjectContains: "BILL" }), msg())).toBe(true);
    expect(matchesMessage(rules({ subjectContains: "invoice" }), msg())).toBe(false);
    expect(matchesMessage(rules({ attachmentNameContains: "nov" }), msg())).toBe(true);
    expect(matchesMessage(rules({ attachmentNameContains: "dec" }), msg())).toBe(false);
  });
  it("handles attachments: required, optional, and a name rule", () => {
    expect(matchesMessage(rules(), msg({ attachments: [] }))).toBe(false);
    expect(matchesMessage(rules({ requireAttachment: false }), msg({ attachments: [] }))).toBe(true);
    expect(matchesMessage(rules({ requireAttachment: false, attachmentNameContains: "x" }), msg({ attachments: [] }))).toBe(false);
  });
  it("any one of several senders is enough", () => {
    expect(matchesMessage(rules({ senders: ["x@y.com", "billing@jio.com"] }), msg())).toBe(true);
  });
});

describe("password rules", () => {
  it("reads and masks a Jio-style trailing bracket password", () => {
    expect(extractSubjectPassword("subject_brackets", null, "Your Jio bill (abc123)")).toBe("abc123");
    expect(extractSubjectPassword("subject_brackets", null, "Bill [pw-9xz]  ")).toBe("pw-9xz");
    expect(extractSubjectPassword("subject_brackets", null, "No password here")).toBeNull();
    expect(redactSubjectPassword("subject_brackets", null, "Your Jio bill (abc123)")).toBe("Your Jio bill ([redacted])");
    expect(redactSubjectPassword("subject_brackets", null, "No password here")).toBe("No password here");
  });
  it("supports a custom pattern with one group", () => {
    const pattern = String.raw`password:\s*(\S+)`;
    expect(extractSubjectPassword("subject_pattern", pattern, "Statement password: Zq81")).toBe("Zq81");
    expect(redactSubjectPassword("subject_pattern", pattern, "Statement password: Zq81 please")).toBe("Statement password: [redacted] please");
  });
  it("never reads a password for modes that do not use the subject", () => {
    expect(extractSubjectPassword("none", null, "Bill (abc123)")).toBeNull();
    expect(extractSubjectPassword("static", null, "Bill (abc123)")).toBeNull();
    expect(redactSubjectPassword("static", null, "Bill (abc123)")).toBe("Bill (abc123)");
  });
  it("rejects unusable patterns", () => {
    expect(validatePasswordPattern(BRACKET_PATTERN)).toBeNull();
    expect(validatePasswordPattern("")).toMatch(/Enter/);
    expect(validatePasswordPattern("(")).toMatch(/not valid/);
    expect(validatePasswordPattern("no group")).toMatch(/exactly one/);
    expect(validatePasswordPattern("(a)(b)")).toMatch(/exactly one/);
    expect(validatePasswordPattern("(?:a)(b)")).toBeNull();
    expect(validatePasswordPattern("(a+)+")).toMatch(/too complicated/);
    expect(validatePasswordPattern("(x)" + "y".repeat(200))).toMatch(/at most/);
  });
  it("truncates very long subjects before matching", () => {
    const long = "a".repeat(5000) + " (secret)";
    expect(extractSubjectPassword("subject_brackets", null, long)).toBeNull();
  });
});

describe("periods in Indian time", () => {
  const IST = 330;
  it("puts month boundaries at midnight IST, not UTC", () => {
    // 2026-11-30 19:00 UTC is already 1 December in India.
    const now = new Date("2026-11-30T19:00:00Z");
    expect(periodKeyFor(now, IST)).toBe("2026-12");
    expect(resolvePeriod("current_month", now, IST)).toMatchObject({ key: "2026-12", start: new Date("2026-11-30T18:30:00Z"), end: new Date("2026-12-31T18:30:00Z") });
    expect(resolvePeriod("previous_month", now, IST)).toMatchObject({ key: "2026-11", start: new Date("2026-10-31T18:30:00Z"), end: new Date("2026-11-30T18:30:00Z") });
  });
  it("rolls over the year", () => {
    expect(resolvePeriod("previous_month", new Date("2027-01-10T00:00:00Z"), IST).key).toBe("2026-12");
    expect(periodRange("2026-12", IST).end).toEqual(new Date("2026-12-31T18:30:00Z"));
  });
});
