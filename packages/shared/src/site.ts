// TODO(question): confirm production DOMAIN; algorithco.dev is a placeholder.
// This file is the single place where the domain and default registry URL are
// defined. Runtime config (apps/api env parsing, Task 8) may override the
// registry URL via env; it must import these constants, never redeclare them.
export const PROJECT_NAME = "Algorithco UI";

export const PLACEHOLDER_DOMAIN = "algorithco.dev";

export const DEFAULT_REGISTRY_URL = `https://${PLACEHOLDER_DOMAIN}/r`;
