export interface DocNavItem {
  id: string;
  label: string;
  file: string;
}

/** In-page docs outline. Order is the install sequence a reader should follow. */
export const DOC_NAV: readonly DocNavItem[] = [
  { id: "install", label: "Install", file: "init.sh" },
  { id: "add", label: "Add a component", file: "add.sh" },
  { id: "files", label: "What gets written", file: "framebits.json" },
  { id: "safety", label: "Safety", file: "verify.ts" },
  { id: "cli-options", label: "CLI options", file: "cli --help" },
];

export const DOC_COMMANDS = {
  init: "npx @framebits/cli init",
  add: "npx @framebits/cli add aurora-text",
  dryRun: "npx @framebits/cli add aurora-text --dry-run",
} as const;
