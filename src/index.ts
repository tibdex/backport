import { toLambda } from "probot-serverless-now";

import { applicationFunction } from "./app";

export = toLambda(applicationFunction);
