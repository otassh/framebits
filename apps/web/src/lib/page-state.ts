import type { RegistryIndex } from "@framebits/shared";

export type IndexState =
  | { status: "loading" }
  | { status: "ready"; index: RegistryIndex }
  | { status: "error"; message: string };
