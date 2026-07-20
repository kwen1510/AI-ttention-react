import "dotenv/config";
import {
  validateArchiveEnvironment,
  validateDeploymentEnvironment
} from "./lib/environment-preflight.mjs";

const mode = process.argv[2];
const validators = {
  archive: validateArchiveEnvironment,
  deployment: validateDeploymentEnvironment
};
if (!validators[mode]) {
  console.error("Usage: node scripts/preflight-environment.mjs <archive|deployment>");
  process.exit(2);
}

const errors = validators[mode](process.env);
if (errors.length) {
  console.error(`${mode === "archive" ? "Archive" : "Deployment"} preflight failed:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`${mode === "archive" ? "Archive" : "Deployment"} preflight passed without displaying secrets.`);
