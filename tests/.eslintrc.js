module.exports = {
  env: { jest: true },
  extends: require.resolve("../.eslintrc"),
  parserOptions: {
    sourceType: "module",
  },
  rules: {
    "init-declarations": "off",
    "max-lines-per-function": "off",
  },
};
