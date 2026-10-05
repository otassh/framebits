export const BUILDER_PACKAGE_NAME = "@framebits/builder";

export { compareDiagnostics, hasDefaultExport, loadRegistry } from "./registry/index.js";
export type {
  Diagnostic,
  LoadRegistryOptions,
  LoadRegistryResult,
  ModelFile,
  RegistryItemModel,
  RegistrySummary,
} from "./registry/index.js";
