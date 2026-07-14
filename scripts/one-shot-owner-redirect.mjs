import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const link = readFileSync(path.join(root, "tmp-owner-magic-link.txt"), "utf8").trim();

const server = createServer((req, res) => {
    res.writeHead(302, { Location: link, "Cache-Control": "no-store" });
    res.end();
    setTimeout(() => process.exit(0), 1500);
});

server.listen(3999, "127.0.0.1", () => {
    console.log(JSON.stringify({ ok: true, listen: "http://127.0.0.1:3999/" }));
});
