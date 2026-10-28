import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./beta-lock-route-harness-loader.mjs", import.meta.url), pathToFileURL("./"));
