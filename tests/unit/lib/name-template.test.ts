import { describe, expect, it } from "vitest";
import { cleanName, fileTemplateProblem, folderTemplateProblem, NAME_PLACEHOLDERS, renderFileName, renderFolderPath, unknownPlaceholders } from "@/lib/name-template";

const ctx = { periodKey: "2026-10", sourceName: "Jio mobile", originalName: "Statement 4411.pdf" };

describe("file names", () => {
  it("builds the example from the brief, in each case", () => {
    expect(renderFileName("phone-bill_xxxx-{{Mon}}{{yy}}", ctx)).toBe("phone-bill_xxxx-Oct26.pdf");
    expect(renderFileName("phone-bill_xxxx-{{mon}}{{yy}}", ctx)).toBe("phone-bill_xxxx-oct26.pdf");
    expect(renderFileName("phone-bill_xxxx-{{MON}}{{yy}}", ctx)).toBe("phone-bill_xxxx-OCT26.pdf");
    expect(renderFileName("phone-bill_xxxx-{{Month}}{{year}}", ctx)).toBe("phone-bill_xxxx-October2026.pdf");
    expect(renderFileName("{{month}}-{{MONTH}}", ctx)).toBe("october-OCTOBER.pdf");
  });
  it("fills every placeholder", () => {
    expect(renderFileName("{{year}}/{{yyyy}} {{mm}} {{period}} {{source}} {{original}}", { ...ctx, sourceName: "A/B" })).toBe("2026 2026 10 2026-10 A B Statement 4411.pdf");
    expect(renderFileName("{{ Mon }}", ctx)).toBe("Oct.pdf"); // spaces inside the braces are fine
  });
  it("does not add .pdf twice, whatever its case, and never produces an empty name", () => {
    expect(renderFileName("jio-{{Mon}}.PDF", ctx)).toBe("jio-Oct.PDF");
    expect(renderFileName("{{original}}", { ...ctx, originalName: null })).toBe("bill.pdf");
  });
  it("keeps slashes and other awkward characters out of the name, also when they come from a source name", () => {
    expect(renderFileName("{{source}}: {{Mon}}?", { ...ctx, sourceName: 'Gas/Water "co"' })).toBe("Gas Water co Oct.pdf");
    expect(cleanName("a\u0000b\\c")).toBe("a b c");
  });
  it("says what is wrong while someone is typing", () => {
    expect(fileTemplateProblem("bill-{{mon}}{{yy}}")).toBeNull();
    expect(fileTemplateProblem("bill-{{Mnth}}")).toMatch(/Unknown placeholder: \{\{Mnth\}\}.*capital letters/);
    expect(fileTemplateProblem("bill-{{MON}}{{Yy}}")).toMatch(/\{\{Yy\}\}/);
    expect(fileTemplateProblem("a/b")).toMatch(/slash/);
    expect(fileTemplateProblem("a\\b")).toMatch(/slash/);
    expect(fileTemplateProblem("bill-{{Mon}")).toMatch(/left over/);
    expect(fileTemplateProblem("???")).toMatch(/needs some text/);
    expect(fileTemplateProblem("x".repeat(151))).toMatch(/at most 150/);
    expect(fileTemplateProblem("{{original}} {{source}}")).toBeNull();
  });
});

describe("folder paths", () => {
  it("builds the examples from the brief", () => {
    expect(renderFolderPath("bills/{{Mon}}{{yy}}", ctx)).toEqual(["bills", "Oct26"]);
    expect(renderFolderPath("bills/{{Mon}}{{year}}", ctx)).toEqual(["bills", "Oct2026"]);
    expect(renderFolderPath("/Family bills//{{year}}/{{mm}}-{{source}}/", ctx)).toEqual(["Family bills", "2026", "10-Jio mobile"]);
  });
  it("drops empty pieces and cleans each folder name on its own", () => {
    expect(renderFolderPath("a/ /b?c/../d", ctx)).toEqual(["a", "b c", "d"]);
  });
  it("is checked on save", () => {
    expect(folderTemplateProblem("bills/{{Mon}}{{yy}}")).toBeNull();
    expect(folderTemplateProblem("")).toMatch(/at least one folder/);
    expect(folderTemplateProblem("/ / /")).toMatch(/at least one folder/);
    expect(folderTemplateProblem("bills/{{original}}")).toMatch(/file name/);
    expect(folderTemplateProblem("bills/{{Mnth}}")).toMatch(/Unknown placeholder/);
    expect(folderTemplateProblem("bills\\2026")).toMatch(/Use \//);
    expect(folderTemplateProblem("a/../b")).toMatch(/cannot be \./);
    expect(folderTemplateProblem("a/./b")).toMatch(/cannot be \./);
    expect(folderTemplateProblem(Array.from({ length: 9 }, () => "x").join("/"))).toMatch(/deep/);
    expect(folderTemplateProblem("x".repeat(101))).toMatch(/at most 100/);
    expect(folderTemplateProblem("{{Mon}")).toMatch(/left over/);
  });
});

describe("placeholders", () => {
  it("lists unknown ones once each, exactly as written", () => {
    expect(unknownPlaceholders("{{Mon}} {{mnth}} {{mnth}} {{x}} {{ Year }}", NAME_PLACEHOLDERS)).toEqual(["mnth", "x", "Year"]);
  });
  it("gives every month the right short and long name", () => {
    const short = Array.from({ length: 12 }, (_, i) => renderFileName("{{Mon}}", { periodKey: `2026-${String(i + 1).padStart(2, "0")}`, sourceName: "s" }, ""));
    expect(short.join(" ")).toBe("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec");
    expect(renderFileName("{{Month}}", { periodKey: "2026-02", sourceName: "s" }, "")).toBe("February");
  });
});
