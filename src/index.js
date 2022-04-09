import { getInput, setFailed } from "@actions/core";
import { context } from "@actions/github";
import ensureError from "ensure-error";
import { template } from "lodash-es";
import { backport } from "./backport.js";
const run = async () => {
    try {
        const [getBody, getHead, _getLabels, getTitle] = [
            "body_template",
            "head_template",
            "labels_template",
            "title_template",
        ].map((name) => template(getInput(name)));
        const labelPattern = getInput("label_pattern");
        const token = getInput("github_token", { required: true });
        const getLabels = ({ base, labels, }) => {
            const json = _getLabels({ base, labels });
            try {
                return JSON.parse(json);
            }
            catch (_error) {
                const error = ensureError(_error);
                throw new Error(`Could not parse labels from invalid JSON: ${json}.`, {
                    cause: error,
                });
            }
        };
        const labelRegExp = new RegExp(labelPattern);
        const payload = context.payload;
        if (payload.action !== "closed" && payload.action !== "labeled") {
            throw new Error(`Unsupported pull request event action: ${payload.action}.`);
        }
        await backport({
            getBody,
            getHead,
            getLabels,
            getTitle,
            labelRegExp,
            payload,
            token,
        });
    }
    catch (_error) {
        const error = ensureError(_error);
        setFailed(error);
    }
};
void run();
