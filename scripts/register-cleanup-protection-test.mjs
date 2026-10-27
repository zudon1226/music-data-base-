import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./cleanup-protection-test-loader.mjs", import.meta.url), pathToFileURL("./"));
