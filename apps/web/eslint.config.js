import base from "../../packages/config/eslint.base.js";

export default [...base, { ignores: ["test-results/**", "playwright-report/**"] }];
