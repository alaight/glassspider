import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".cursor/**", ".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
