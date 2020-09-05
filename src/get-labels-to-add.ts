/**
 * Get an array of labels to be added to the PR.
 * Filtering out empty strings.
 */
export const getLabelsToAdd = (input: string | undefined): string[] => {
  if (input === undefined || input === "") {
    return [];
  }

  const labels = input.split(",");
  return labels.map((v) => v.trim()).filter((v) => v !== "");
};
