import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
