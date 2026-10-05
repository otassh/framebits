/**
 * Prompt abstraction so commands stay unit-testable.
 * Production implementation uses @clack/prompts; tests inject fakes.
 */
import * as clack from "@clack/prompts";

export interface Prompts {
  confirm(message: string, initial?: boolean): Promise<boolean>;
  selectFileAction(file: string): Promise<"overwrite" | "skip" | "abort">;
}

export function nodePrompts(): Prompts {
  return {
    confirm(message: string, initial = true): Promise<boolean> {
      return clack.confirm({ message, initialValue: initial }).then((result) => {
        if (clack.isCancel(result)) return false;
        return result;
      });
    },
    selectFileAction(file: string): Promise<"overwrite" | "skip" | "abort"> {
      return clack
        .select({
          message: `conflict: ${file} exists and differs. What now?`,
          options: [
            { value: "overwrite", label: "Overwrite" },
            { value: "skip", label: "Skip (item may be incomplete)" },
            { value: "abort", label: "Abort" },
          ],
        })
        .then((result): "overwrite" | "skip" | "abort" => {
          if (clack.isCancel(result)) return "abort";
          switch (result) {
            case "overwrite":
              return "overwrite";
            case "skip":
              return "skip";
            default:
              return "abort";
          }
        });
    },
  };
}

export function fakePrompts(answers: {
  confirms?: boolean[];
  fileActions?: Array<"overwrite" | "skip" | "abort">;
}): Prompts & { calls: string[] } {
  const calls: string[] = [];
  const confirms = [...(answers.confirms ?? [])];
  const fileActions = [...(answers.fileActions ?? [])];
  return {
    calls,
    confirm(message: string): Promise<boolean> {
      calls.push(`confirm:${message}`);
      return Promise.resolve(confirms.shift() ?? true);
    },
    selectFileAction(file: string): Promise<"overwrite" | "skip" | "abort"> {
      calls.push(`file:${file}`);
      return Promise.resolve(fileActions.shift() ?? "skip");
    },
  };
}
