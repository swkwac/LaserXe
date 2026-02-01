/**
 * Input for generating AI/code rules content (e.g. Cursor/WindSurf rules).
 */
export interface RulesBuildInput {
  /** Project name; default "Project" when missing or blank. Max 200 chars. */
  projectName?: string;
  /** Optional description (plain text). */
  description?: string;
  /** Tech stack items; rendered as bullet list or "(none)" when empty. */
  techStack?: string[];
  /** Custom sections (title + content). Sections with empty title are skipped. */
  sections?: Array<{ title: string; content: string }>;
}

const DEFAULT_PROJECT_NAME = "Project";
const MAX_PROJECT_NAME_LENGTH = 200;
const EMPTY_SECTION_PLACEHOLDER = "(empty)";
const EMPTY_TECH_STACK_PLACEHOLDER = "(none)";

/**
 * Generates markdown rules content from the given input.
 *
 * Business rules:
 * - Header: "# AI Rules for {projectName}" (default "Project", max 200 chars).
 * - Optional description after header.
 * - Required "## Tech Stack" section: bullet list or "(none)" when empty.
 * - Custom sections: only those with non-empty title; blank content → "(empty)".
 * - Null/undefined input treated as empty object (minimal output).
 */
export class RulesBuilderService {
  static generateRulesContent(input?: RulesBuildInput | null): string {
    const opts = input ?? {};
    const lines: string[] = [];

    const projectName = RulesBuilderService.normalizeProjectName(opts.projectName);
    lines.push(`# AI Rules for ${projectName}`);

    const description = opts.description?.trim();
    if (description) {
      lines.push("", description);
    }

    lines.push("", "## Tech Stack");
    const techStack = opts.techStack ?? [];
    if (techStack.length === 0) {
      lines.push("", EMPTY_TECH_STACK_PLACEHOLDER);
    } else {
      for (const item of techStack) {
        const trimmed = String(item).trim();
        if (trimmed) lines.push(`- ${trimmed}`);
      }
    }

    const sections = opts.sections ?? [];
    for (const section of sections) {
      const title = section.title?.trim();
      if (!title) continue;
      const content = section.content?.trim();
      lines.push("", `## ${title}`, "", content || EMPTY_SECTION_PLACEHOLDER);
    }

    return lines.join("\n");
  }

  /**
   * Normalizes project name: trim, default to DEFAULT_PROJECT_NAME when blank, truncate to MAX_PROJECT_NAME_LENGTH.
   */
  static normalizeProjectName(value?: string | null): string {
    const trimmed = value?.trim() ?? "";
    if (trimmed === "") return DEFAULT_PROJECT_NAME;
    if (trimmed.length <= MAX_PROJECT_NAME_LENGTH) return trimmed;
    return trimmed.slice(0, MAX_PROJECT_NAME_LENGTH - 3) + "...";
  }
}
