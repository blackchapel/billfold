import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const shared = ["lib", "constants", "types"];

const config = [
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain/**" },
        { type: "application", pattern: "src/server/application/**" },
        { type: "infra", pattern: "src/server/infra/**" },
        { type: "http", pattern: "src/server/http/**" },
        { type: "composition", pattern: "src/server/composition-root/**" },
        { type: "app", pattern: "src/app/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "hooks", pattern: "src/hooks/**" },
        { type: "emails", pattern: "src/emails/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "constants", pattern: "src/constants/**" },
        { type: "types", pattern: "src/types/**" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        2,
        {
          default: "disallow",
          policies: [
            { from: { element: { type: "domain" } }, allow: { to: { element: { types: ["domain", ...shared] } } } },
            { from: { element: { type: "application" } }, allow: { to: { element: { types: ["application", "domain", ...shared] } } } },
            { from: { element: { type: "infra" } }, allow: { to: { element: { types: ["infra", "domain", ...shared] } } } },
            { from: { element: { type: "http" } }, allow: { to: { element: { types: ["http", "application", "domain", "composition", ...shared] } } } },
            { from: { element: { type: "composition" } }, allow: { to: { element: { types: ["composition", "application", "infra", "domain", ...shared] } } } },
            { from: { element: { type: "app" } }, allow: { to: { element: { types: ["app", "components", "hooks", "http", "composition", "emails", ...shared] } } } },
            { from: { element: { type: "components" } }, allow: { to: { element: { types: ["components", "hooks", ...shared] } } } },
            { from: { element: { type: "hooks" } }, allow: { to: { element: { types: ["hooks", "http", ...shared] } } } },
            { from: { element: { type: "emails" } }, allow: { to: { element: { types: ["emails", ...shared] } } } },
            { from: { element: { type: "lib" } }, allow: { to: { element: { types: ["lib", "constants", "types"] } } } },
            { from: { element: { type: "constants" } }, allow: { to: { element: { types: ["constants", "types"] } } } },
            { from: { element: { type: "types" } }, allow: { to: { element: { types: ["types", "domain"] } } } },
          ],
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
];
export default config;
