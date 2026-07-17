/**
 * Align every locale dictionary to enMessages:
 * - add missing keys (copy English)
 * - remove keys that no longer exist in English
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = path.join(root, "lib/i18n/messages");

function messagesExportName(locale) {
    if (locale === "zh-CN") return "zhCNMessages";
    if (locale === "zh-TW") return "zhTWMessages";
    return `${locale}Messages`;
}

function parseExportObject(filePath, exportName) {
    const content = readFileSync(filePath, "utf8");
    const marker = `export const ${exportName}`;
    const start = content.indexOf(marker);
    if (start < 0) throw new Error(`Missing export ${exportName} in ${filePath}`);
    const braceStart = content.indexOf("{", start);
    let depth = 0;
    let end = braceStart;
    for (; end < content.length; end += 1) {
        if (content[end] === "{") depth += 1;
        if (content[end] === "}") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    return eval(`(${content.slice(braceStart, end + 1)})`);
}

function alignToSource(target, source) {
    const out = {};
    for (const [key, value] of Object.entries(source)) {
        if (typeof value === "string") {
            const existing = target?.[key];
            out[key] = typeof existing === "string" && existing.trim() ? existing : value;
        }
        else if (value && typeof value === "object") {
            out[key] = alignToSource(
                target?.[key] && typeof target[key] === "object" ? target[key] : {},
                value,
            );
        }
    }
    return out;
}

function serializeMessages(obj, indent = 4) {
    const pad = " ".repeat(indent);
    const lines = ["{"];
    const entries = Object.entries(obj);
    entries.forEach(([key, value], index) => {
        const comma = index < entries.length - 1 ? "," : "";
        if (typeof value === "string") {
            lines.push(`${pad}${key}: ${JSON.stringify(value)}${comma}`);
        }
        else {
            const nested = serializeMessages(value, indent + 4)
                .split("\n")
                .map((line, lineIndex) => (lineIndex === 0 ? line : `${pad}${line}`))
                .join("\n");
            lines.push(`${pad}${key}: ${nested}${comma}`);
        }
    });
    lines.push(`${" ".repeat(Math.max(0, indent - 4))}}`);
    return lines.join("\n");
}

const en = parseExportObject(path.join(messagesDir, "en.ts"), "enMessages");
const files = readdirSync(messagesDir).filter((name) => name.endsWith(".ts") && name !== "en.ts");

for (const file of files) {
    const locale = file.replace(/\.ts$/, "");
    const exportName = messagesExportName(locale);
    const filePath = path.join(messagesDir, file);
    const current = parseExportObject(filePath, exportName);
    const merged = alignToSource(current, en);
    const body = serializeMessages(merged, 4);
    const next = `import type { LocaleMessageDictionary } from "./en";\n\nexport const ${exportName}: LocaleMessageDictionary = ${body};\n`;
    writeFileSync(filePath, next, "utf8");
    console.log(`synced ${locale}`);
}

console.log(`Done. Synced ${files.length} locale files.`);
