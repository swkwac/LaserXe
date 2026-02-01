import { describe, it, expect } from "vitest";
import { RulesBuilderService } from "./RulesBuilderService";

describe("RulesBuilderService.generateRulesContent()", () => {
  describe("reguły biznesowe – nagłówek i domyślna nazwa projektu", () => {
    it("zwraca nagłówek z domyślną nazwą 'Project' gdy input jest undefined", () => {
      const result = RulesBuilderService.generateRulesContent(undefined);
      expect(result).toMatch(/^# AI Rules for Project\n/);
    });

    it("zwraca nagłówek z domyślną nazwą 'Project' gdy input jest null", () => {
      const result = RulesBuilderService.generateRulesContent(null);
      expect(result).toMatch(/^# AI Rules for Project\n/);
    });

    it("zwraca nagłówek z domyślną nazwą 'Project' gdy projectName jest pusty string", () => {
      const result = RulesBuilderService.generateRulesContent({ projectName: "" });
      expect(result).toMatch(/^# AI Rules for Project\n/);
    });

    it("zwraca nagłówek z domyślną nazwą 'Project' gdy projectName jest samymi spacjami", () => {
      const result = RulesBuilderService.generateRulesContent({ projectName: "   " });
      expect(result).toMatch(/^# AI Rules for Project\n/);
    });

    it("używa podanej nazwy projektu po usunięciu białych znaków", () => {
      const result = RulesBuilderService.generateRulesContent({ projectName: "  LaserXe  " });
      expect(result).toMatch(/^# AI Rules for LaserXe\n/);
    });
  });

  describe("reguły biznesowe – opis (description)", () => {
    it("nie dodaje opisu gdy description jest undefined", () => {
      const result = RulesBuilderService.generateRulesContent({});
      expect(result).not.toContain("description");
      expect(result).toContain("## Tech Stack");
    });

    it("dodaje opis gdy description jest niepusty", () => {
      const result = RulesBuilderService.generateRulesContent({
        description: "Aplikacja do planowania zabiegów.",
      });
      expect(result).toContain("Aplikacja do planowania zabiegów.");
      expect(result).toContain("## Tech Stack");
    });

    it("obcina białe znaki z opisu", () => {
      const result = RulesBuilderService.generateRulesContent({
        description: "  Opis projektu  ",
      });
      expect(result).toContain("Opis projektu");
    });

    it("nie dodaje pustego bloku gdy description jest pusty po trim", () => {
      const result = RulesBuilderService.generateRulesContent({ description: "   " });
      const afterHeader = result.split("# AI Rules for Project\n\n")[1];
      expect(afterHeader).toMatch(/^## Tech Stack/);
    });
  });

  describe("reguły biznesowe – sekcja Tech Stack", () => {
    it("zawiera sekcję '## Tech Stack' nawet przy pustym inpucie", () => {
      const result = RulesBuilderService.generateRulesContent({});
      expect(result).toContain("## Tech Stack");
    });

    it("wyświetla '(none)' gdy techStack jest undefined", () => {
      const result = RulesBuilderService.generateRulesContent({});
      expect(result).toContain("(none)");
    });

    it("wyświetla '(none)' gdy techStack jest pustą tablicą", () => {
      const result = RulesBuilderService.generateRulesContent({ techStack: [] });
      expect(result).toContain("(none)");
    });

    it("renderuje elementy tech stack jako listę punktowaną", () => {
      const result = RulesBuilderService.generateRulesContent({
        techStack: ["Astro", "React", "TypeScript"],
      });
      expect(result).toContain("- Astro");
      expect(result).toContain("- React");
      expect(result).toContain("- TypeScript");
    });

    it("pomija puste elementy w tech stack (po trim)", () => {
      const result = RulesBuilderService.generateRulesContent({
        techStack: ["Astro", "  ", "React"],
      });
      expect(result).toContain("- Astro");
      expect(result).toContain("- React");
      const bulletLines = result.split("\n").filter((line) => line.startsWith("- "));
      expect(bulletLines).toHaveLength(2);
    });

    it("obcina białe znaki z elementów tech stack", () => {
      const result = RulesBuilderService.generateRulesContent({
        techStack: ["  Astro 5  "],
      });
      expect(result).toContain("- Astro 5");
    });
  });

  describe("reguły biznesowe – sekcje własne (sections)", () => {
    it("dodaje sekcję z tytułem i treścią", () => {
      const result = RulesBuilderService.generateRulesContent({
        sections: [{ title: "Coding practices", content: "Use TypeScript." }],
      });
      expect(result).toContain("## Coding practices");
      expect(result).toContain("Use TypeScript.");
    });

    it("wyświetla '(empty)' gdy treść sekcji jest pusta", () => {
      const result = RulesBuilderService.generateRulesContent({
        sections: [{ title: "Empty section", content: "" }],
      });
      expect(result).toContain("## Empty section");
      expect(result).toContain("(empty)");
    });

    it("wyświetla '(empty)' gdy treść sekcji to same białe znaki", () => {
      const result = RulesBuilderService.generateRulesContent({
        sections: [{ title: "Blank", content: "   \n\t  " }],
      });
      expect(result).toContain("(empty)");
    });

    it("pomija sekcje z pustym tytułem (po trim)", () => {
      const result = RulesBuilderService.generateRulesContent({
        sections: [
          { title: "Valid", content: "Content" },
          { title: "  ", content: "Should not appear" },
          { title: "", content: "Also not" },
        ],
      });
      expect(result).toContain("## Valid");
      expect(result).toContain("Content");
      expect(result).not.toContain("Should not appear");
      expect(result).not.toContain("Also not");
    });

    it("zachowuje kolejność sekcji", () => {
      const result = RulesBuilderService.generateRulesContent({
        sections: [
          { title: "First", content: "A" },
          { title: "Second", content: "B" },
        ],
      });
      const firstPos = result.indexOf("## First");
      const secondPos = result.indexOf("## Second");
      expect(firstPos).toBeGreaterThanOrEqual(0);
      expect(secondPos).toBeGreaterThan(firstPos);
    });
  });

  describe("warunki brzegowe – długość nazwy projektu", () => {
    it("obcina nazwę projektu do 200 znaków i dodaje '...'", () => {
      const longName = "A".repeat(250);
      const result = RulesBuilderService.generateRulesContent({ projectName: longName });
      const header = result.split("\n")[0];
      expect(header).toHaveLength(200 - 3 + 3 + "# AI Rules for ".length);
      expect(header).toMatch(/# AI Rules for A+\.\.\.$/);
    });

    it("nie obcina nazwy o długości dokładnie 200 znaków", () => {
      const name200 = "A".repeat(200);
      const result = RulesBuilderService.generateRulesContent({ projectName: name200 });
      expect(result).toContain(`# AI Rules for ${name200}`);
      expect(result).not.toContain("...");
    });

    it("obcina po 197 znakach nazwy i dodaje '...' gdy nazwa ma ponad 200 znaków", () => {
      const nameLong = "B".repeat(201);
      const result = RulesBuilderService.generateRulesContent({ projectName: nameLong });
      const header = result.split("\n")[0];
      expect(header).toMatch(/# AI Rules for B+\.\.\.$/);
      expect(header.length).toBeLessThanOrEqual("# AI Rules for ".length + 200);
    });
  });

  describe("warunki brzegowe – minimalny i pełny output", () => {
    it("minimalny output (tylko nagłówek i Tech Stack) ma oczekiwaną strukturę", () => {
      const result = RulesBuilderService.generateRulesContent({});
      expect(result).toMatchInlineSnapshot(`
        "# AI Rules for Project

        ## Tech Stack

        (none)"
      `);
    });

    it("pełny output z wszystkimi polami ma spójną strukturę markdown", () => {
      const result = RulesBuilderService.generateRulesContent({
        projectName: "LaserXe",
        description: "Planowanie zabiegów laserowych.",
        techStack: ["Astro", "React", "Python"],
        sections: [{ title: "Struktura", content: "Backend w ./backend." }],
      });
      expect(result).toContain("# AI Rules for LaserXe");
      expect(result).toContain("Planowanie zabiegów laserowych.");
      expect(result).toContain("- Astro");
      expect(result).toContain("- React");
      expect(result).toContain("- Python");
      expect(result).toContain("## Struktura");
      expect(result).toContain("Backend w ./backend.");
    });
  });

  describe("normalizeProjectName (logika używana wewnętrznie)", () => {
    it("zwraca 'Project' dla undefined", () => {
      expect(RulesBuilderService.normalizeProjectName(undefined)).toBe("Project");
    });

    it("zwraca 'Project' dla null", () => {
      expect(RulesBuilderService.normalizeProjectName(null)).toBe("Project");
    });

    it("zwraca 'Project' dla pustego stringa", () => {
      expect(RulesBuilderService.normalizeProjectName("")).toBe("Project");
    });

    it("zwraca obciętą nazwę z '...' gdy przekroczony limit", () => {
      const long = "X".repeat(300);
      const out = RulesBuilderService.normalizeProjectName(long);
      expect(out).toHaveLength(200);
      expect(out.endsWith("...")).toBe(true);
    });
  });
});
