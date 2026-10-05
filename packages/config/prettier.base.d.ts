/** Types for the shared Prettier config (allows TS consumers without allowJs). */
declare const config: {
  readonly semi: boolean;
  readonly singleQuote: boolean;
  readonly trailingComma: "all";
  readonly printWidth: number;
};

export default config;
