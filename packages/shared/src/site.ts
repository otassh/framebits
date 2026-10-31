// Permanent production domain, confirmed by the owner.
// This file is the single place where the domain and default registry URL are
// defined. Runtime config (apps/api env parsing, Task 8) may override the
// registry URL via env; it must import these constants, never redeclare them.
export const PROJECT_NAME = "Framebits";

export const SITE_DOMAIN = "framebits.trqsh.uz";
export const SITE_ORIGIN = `https://${SITE_DOMAIN}`;

export const DEFAULT_REGISTRY_URL = `${SITE_ORIGIN}/r`;
export const CONFIG_SCHEMA_URL = `${SITE_ORIGIN}/schema/config.json`;
