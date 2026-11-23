/**
 * Regression: save-metadata must authenticate before storagePath/publicUrl validation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(repo, "app/api/upload-audio/route.ts");
const source = fs.readFileSync(routePath, "utf8");

const fnMatch = source.match(/async function handleSaveSongMetadata[\s\S]*?^}/m);
if (!fnMatch) {
    console.error("FAIL handleSaveSongMetadata not found");
    process.exit(1);
}
const fn = fnMatch[0];
const authPos = fn.indexOf("requireAudioUploadUser");
const storagePos = fn.indexOf('storagePath is required after the Storage upload completes');
if (authPos < 0 || storagePos < 0) {
    console.error("FAIL could not locate auth or storagePath guard");
    process.exit(1);
}
if (authPos >= storagePos) {
    console.error("FAIL requireAudioUploadUser must appear before storagePath validation");
    process.exit(1);
}
console.log("PASS save-metadata authenticates before storagePath validation");

const prepareMatch = source.match(/async function handlePrepareStorageUpload[\s\S]*?^}/m);
if (!prepareMatch) {
    console.error("FAIL handlePrepareStorageUpload not found");
    process.exit(1);
}
const prepareFn = prepareMatch[0];
const prepareAuthPos = prepareFn.indexOf("requireAudioUploadUser");
const prepareStoragePos = prepareFn.indexOf('storagePath is required.');
if (prepareAuthPos < 0 || prepareStoragePos < 0 || prepareAuthPos >= prepareStoragePos) {
    console.error("FAIL prepare-storage-upload must authenticate before storagePath validation");
    process.exit(1);
}
console.log("PASS prepare-storage-upload authenticates before storagePath validation");