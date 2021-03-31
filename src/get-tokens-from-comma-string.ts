/**
 * Get an array of tokens from comma separated list
 * Filtering out empty strings.
 */
const getTokensFromCommaString = (input: string | undefined): string[] => {
  if (input === undefined || input === "") {
    return [];
  }

  const tokens = input.split(",");
  return tokens.map((v) => v.trim()).filter((v) => v !== "");
};

export { getTokensFromCommaString };
