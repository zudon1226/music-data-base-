import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isFile(filePath) {
    try {
        return statSync(filePath).isFile();
    }
    catch {
        return false;
    }
}

function resolveLocal(specifier, parentURL) {
    let base = "";
    if (specifier.startsWith("@/")) {
        base = path.join(root, specifier.slice(2));
    }
    else if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const parent = parentURL ? fileURLToPath(parentURL) : root;
        base = path.resolve(path.dirname(parent), specifier);
    }
    else {
        return null;
    }
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.js`, `${base}.mjs`];
    for (const candidate of candidates) {
        if (existsSync(candidate) && isFile(candidate)) {
            return pathToFileURL(candidate).href;
        }
    }
    return null;
}

export async function resolve(specifier, context, nextResolve) {
    const mapped = resolveLocal(specifier, context.parentURL);
    if (!mapped) return nextResolve(specifier, context);
    return {
        url: mapped,
        shortCircuit: true,
    };
}
