/**
 * Playwright helpers for Mixtape Studio (large-catalog safe, ID-based selection).
 */

export const STUDIO_FIRST_PAGE_TIMEOUT_MS = 180_000;
export const STUDIO_SELECT_BY_ID_TIMEOUT_MS = 180_000;

export function isMixtapeCreatePost(response) {
    const url = response.url();
    return (
        response.request().method() === "POST"
        && url.includes("/api/mixtapes")
        && !url.includes("/tracks")
        && !url.includes("/uploads")
        && !url.includes("/favorites")
        && !url.includes("/playback")
        && !url.includes("/reports")
        && !url.includes("/analytics")
    );
}

export function isStudioMineCatalogGet(response) {
    return response.request().method() === "GET"
        && response.url().includes("/api/mixtapes")
        && response.url().includes("scope=mine");
}

export function isStudioMineFirstCatalogPage(response) {
    return isStudioMineCatalogGet(response) && !response.url().includes("cursor=");
}

/**
 * @param {import("playwright").Page} page
 */
export async function loginMixtapeCreator(page, baseUrl, email, password) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: /Already have an account/i }).click({ timeout: 60_000 });
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: /^Login$/i }).click();
    const shellSelector = "main.zml-app[data-active-view], .desktop-sidebar-nav, .mobile-app-chrome, [data-mixtape-studio]";
    await page.waitForSelector(shellSelector, { timeout: 120_000 });
    await page.waitForSelector('main.zml-app[data-roles-ready="true"]', { timeout: 120_000 });
    await page.waitForFunction(
        () => {
            const main = document.querySelector("main.zml-app");
            if (!main || main.getAttribute("data-roles-ready") !== "true") return false;
            if (main.getAttribute("data-upload-permission-pending") === "true") return false;
            const studioNav = document.querySelector('.desktop-sidebar-nav button[data-nav-view="Mixtape Studio"]');
            return Boolean(studioNav);
        },
        undefined,
        { timeout: 120_000 },
    );
}

/**
 * @param {import("playwright").Page} page
 */
export async function openMixtapeStudio(page, timeout = STUDIO_FIRST_PAGE_TIMEOUT_MS) {
    const deadline = Date.now() + timeout;
    const remainingTimeout = () => Math.max(5_000, Math.min(60_000, deadline - Date.now()));
    while (Date.now() < deadline) {
        const onStudio = await page.locator('main.zml-app[data-active-view="Mixtape Studio"]').count();
        const studioMounted = await page.locator("[data-mixtape-studio]").count();
        if (onStudio && studioMounted) return;
        const studioNav = page.locator('.desktop-sidebar-nav button[data-nav-view="Mixtape Studio"]').first();
        if (await studioNav.count()) {
            await studioNav.click({ timeout: 10_000 }).catch(() => null);
        }
        else {
            const studioLink = page.getByRole("link", { name: /Mixtape Studio/i });
            if (await studioLink.count()) await studioLink.first().click({ timeout: 10_000 }).catch(() => null);
        }
        const switched = await page
            .waitForFunction(
                () => {
                    const view = document.querySelector("main.zml-app")?.getAttribute("data-active-view");
                    if (view !== "Mixtape Studio") return false;
                    return Boolean(document.querySelector("[data-mixtape-studio]"));
                },
                undefined,
                { timeout: remainingTimeout() },
            )
            .catch(() => null);
        if (switched) return;
        await page.waitForTimeout(250);
    }
    await page.waitForFunction(
        () => {
            const view = document.querySelector("main.zml-app")?.getAttribute("data-active-view");
            if (view !== "Mixtape Studio") return false;
            return Boolean(document.querySelector("[data-mixtape-studio]"));
        },
        undefined,
        { timeout: remainingTimeout() },
    );
    await page.waitForSelector("[data-mixtape-studio]", { timeout: remainingTimeout() });
}

/**
 * @param {import("playwright").Page} page
 */
export async function waitForMixtapeStudioReady(page, timeout = STUDIO_FIRST_PAGE_TIMEOUT_MS) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        await reopenMixtapeStudioIfNeeded(page).catch(() => null);
        const ready = await page.evaluate(() => {
            const view = document.querySelector("main.zml-app")?.getAttribute("data-active-view");
            if (view !== "Mixtape Studio") return false;
            const studio = document.querySelector("[data-mixtape-studio]");
            if (!studio) return false;
            const text = studio.textContent || "";
            if (/Loading studio/i.test(text)) return false;
            return Boolean(
                document.querySelector("[data-mixtape-studio] select#mixtape-select")
                && document.querySelector("[data-mixtape-studio] #mixtape-title"),
            );
        }).catch(() => false);
        if (ready) return;
        await page.waitForTimeout(250);
    }
    throw new Error("Mixtape Studio did not become interactive before deadline");
}

/** Create mixtape form is interactive (first catalog page applied; not blocked by initial loader). */
export async function waitForStudioCreateFormReady(page, timeout = STUDIO_FIRST_PAGE_TIMEOUT_MS) {
    await waitForMixtapeStudioReady(page, timeout);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        await reopenMixtapeStudioIfNeeded(page).catch(() => null);
        const ready = await page.evaluate(() => {
            const select = document.querySelector('[data-mixtape-studio] select#mixtape-select');
            if (!select) return false;
            return select.options.length >= 2 || (select.options.length === 1 && select.options[0].value !== "");
        }).catch(() => false);
        if (ready) return;
        await page.waitForTimeout(250);
    }
    throw new Error("Studio create form catalog select not ready before deadline");
}

/**
 * Wait for first mine catalog page only (not full background pagination).
 * @param {import("playwright").Page} page
 */
export async function waitForStudioFirstCatalogPage(page, timeout = STUDIO_FIRST_PAGE_TIMEOUT_MS) {
    const firstPage = page.waitForResponse(isStudioMineFirstCatalogPage, { timeout }).catch(() => null);
    await openMixtapeStudio(page, timeout);
    await firstPage;
    await waitForMixtapeStudioReady(page, timeout);
    await waitForStudioCreateFormReady(page, timeout);
}

/**
 * @param {import("playwright").Page} page
 */
export async function ensureStudioMixtapeSelected(page, mixtapeId, timeout = STUDIO_SELECT_BY_ID_TIMEOUT_MS) {
    await waitForStudioSelectorMixtape(page, mixtapeId, timeout);
}

/**
 * @param {import("playwright").Page} page
 */
export async function assertStudioSelection(page, mixtapeId, expectedTitle, expectedStatus = "draft") {
    await ensureStudioMixtapeSelected(page, mixtapeId);
    const optionText = await page.locator(`[data-mixtape-studio] select#mixtape-select option[value="${mixtapeId}"]`).innerText();
    if (!optionText.includes(expectedTitle)) {
        throw new Error(`selector title mismatch id=${mixtapeId} option="${optionText}" expected="${expectedTitle}"`);
    }
    const status = await readStudioStatus(page);
    if (status !== expectedStatus) {
        throw new Error(`studio status expected=${expectedStatus} actual=${status}`);
    }
}

/**
 * @param {import("playwright").Page} page
 */
export async function readStudioStatus(page) {
    const text = await page.locator("[data-mixtape-studio]").innerText();
    const match = text.match(/Status:\s*(\w+)/i);
    return match ? match[1].toLowerCase() : "";
}

/**
 * @param {import("playwright").Page} page
 */
export async function fillMixtapeCreateForm(page, { title, description = "", genre = "Regression" }) {
    const studio = page.locator("[data-mixtape-studio]");
    const deadline = Date.now() + STUDIO_FIRST_PAGE_TIMEOUT_MS;
    let titleBound = false;
    while (Date.now() < deadline && !titleBound) {
        try {
            await reopenMixtapeStudioIfNeeded(page);
            await waitForStudioCreateFormReady(page, Math.max(10_000, deadline - Date.now()));
            const titleInput = studio.locator("#mixtape-title");
            await titleInput.click({ timeout: 5_000 });
            await titleInput.fill("");
            await titleInput.pressSequentially(title, { delay: 15 });
            await page.waitForFunction(
                (expected) => document.querySelector("#mixtape-title")?.value === expected,
                title,
                { timeout: 5_000 },
            );
            titleBound = (await titleInput.inputValue()) === title;
            if (titleBound) {
                await studio.locator("#mixtape-description").fill(description, { timeout: 10_000 });
                await studio.locator("#mixtape-genre").fill(genre, { timeout: 10_000 });
            }
        }
        catch {
            // Studio can remount while the first catalog page applies on large libraries.
        }
    }
    if (!titleBound) {
        throw new Error("create form title did not bind before studio sync deadline");
    }
}

export async function reopenMixtapeStudioIfNeeded(page) {
    const onStudio = await page
        .locator('main.zml-app[data-active-view="Mixtape Studio"]')
        .count()
        .catch(() => 0);
    const studioMounted = await page.locator("[data-mixtape-studio]").count().catch(() => 0);
    if (onStudio && studioMounted) return;
    const studioNav = page.locator('.desktop-sidebar-nav button[data-nav-view="Mixtape Studio"]').first();
    if (await studioNav.count()) {
        await studioNav.click();
    }
    else {
        const studioLink = page.getByRole("link", { name: /Mixtape Studio/i });
        if (await studioLink.count()) await studioLink.first().click();
    }
    await page.waitForFunction(
        () => document.querySelector("main.zml-app")?.getAttribute("data-active-view") === "Mixtape Studio",
        undefined,
        { timeout: STUDIO_FIRST_PAGE_TIMEOUT_MS },
    );
}

export async function waitForStudioSelectorMixtape(page, mixtapeId, timeout = STUDIO_SELECT_BY_ID_TIMEOUT_MS) {
    await reopenMixtapeStudioIfNeeded(page);
    await page.waitForFunction(
        (id) => {
            const select = document.querySelector('[data-mixtape-studio] select#mixtape-select');
            if (!select) return false;
            return [...select.options].some((option) => option.value === id) || select.value === id;
        },
        mixtapeId,
        { timeout },
    );
    const select = page.locator("[data-mixtape-studio] select#mixtape-select");
    if ((await select.inputValue()) !== mixtapeId) {
        await select.selectOption(mixtapeId);
    }
}

export async function createMixtapeInStudio(page, { title, description = "", genre = "Regression" }) {
    await fillMixtapeCreateForm(page, { title, description, genre });
    const studio = page.locator("[data-mixtape-studio]");
    const createWait = page.waitForResponse(isMixtapeCreatePost, { timeout: STUDIO_FIRST_PAGE_TIMEOUT_MS });
    await studio.getByRole("button", { name: /Create mixtape/i }).click();
    const createRes = await createWait;
    const body = await createRes.json().catch(() => ({}));
    const id = String(body.mixtape?.id || "").trim();
    if (!id || createRes.status() !== 201) {
        throw new Error(`Studio create failed http=${createRes.status()} id=${id || "missing"}`);
    }
    await page.getByText(/Mixtape created/i).waitFor({ state: "visible", timeout: STUDIO_SELECT_BY_ID_TIMEOUT_MS }).catch(() => null);
    await waitForStudioSelectorMixtape(page, id);
    await assertStudioSelection(page, id, title, "draft");
    return { id, title, httpStatus: createRes.status() };
}

/**
 * @param {import("playwright").Page} page
 */
export async function reloadStudioAndSelect(page, mixtapeId, baseUrl) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('main.zml-app[data-roles-ready="true"]', { timeout: 120_000 });
    await waitForStudioFirstCatalogPage(page);
    await ensureStudioMixtapeSelected(page, mixtapeId);
}

/**
 * @param {import("playwright").Page} page
 */
export async function uploadStudioTrack(page, filePath) {
    const studio = page.locator("[data-mixtape-studio]");
    const uploadsWait = page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/mixtapes/uploads"),
        { timeout: 120_000 },
    );
    const trackWait = page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/mixtapes/tracks"),
        { timeout: 120_000 },
    );
    await studio.locator('input[type="file"][accept*="audio"]').setInputFiles(filePath);
    const uploads = await uploadsWait;
    const track = await trackWait;
    await page.getByText(/Track uploaded/i).waitFor({ state: "visible", timeout: 120_000 }).catch(() => null);
    return { prepareStatus: uploads.status(), trackStatus: track.status() };
}

/**
 * @param {import("playwright").Page} page
 */
export async function uploadStudioCover(page, filePath) {
    const studio = page.locator("[data-mixtape-studio]");
    await studio.getByText(/Upload cover|Replace cover/i).waitFor({ state: "visible", timeout: 60_000 });
    const uploadsWait = page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/mixtapes/uploads"),
        { timeout: 120_000 },
    );
    const patchWait = page.waitForResponse(
        (r) => r.request().method() === "PATCH" && /\/api\/mixtapes\/[^/]+$/.test(r.url()),
        { timeout: 120_000 },
    );
    await studio.locator('input[accept*="image"]').setInputFiles(filePath);
    const prepare = await uploadsWait;
    const patch = await patchWait;
    const messageVisible = await page.getByText(/Cover artwork updated/i).isVisible().catch(() => false);
    await waitForCoverPreviewBackground(page).catch(() => null);
    return { prepareStatus: prepare.status(), patchStatus: patch.status(), messageVisible };
}

/**
 * @param {import("playwright").Page} page
 */
export async function publishFirstTrackInStudio(page) {
    const publish = page.locator("[data-mixtape-studio]").getByRole("button", { name: /^Publish$/i }).first();
    await publish.waitFor({ state: "visible", timeout: 60_000 });
    const patchWait = page.waitForResponse(
        (r) => r.request().method() === "PATCH" && r.url().includes("/api/mixtapes/tracks/"),
        { timeout: 120_000 },
    );
    await publish.click();
    const res = await patchWait;
    return res.status();
}

/**
 * @param {import("playwright").Page} page
 * @param {RegExp|string} buttonName
 * @param {"PATCH"|"DELETE"} method
 */
export async function waitForStudioStatus(page, status, timeout = 60_000) {
    await page.waitForFunction(
        (expected) => new RegExp(`Status:\\s*${expected}`, "i").test(
            document.querySelector("[data-mixtape-studio]")?.innerText || "",
        ),
        status,
        { timeout },
    );
}

function mixtapeStatusRowLocator(page) {
    return page
        .locator('[data-mixtape-studio] span[aria-live="polite"]')
        .filter({ hasText: /^Status:/i })
        .locator("xpath=..");
}

export async function clickMixtapeStatusButton(page, buttonName, method = "PATCH", mixtapeId = "") {
    const deadline = Date.now() + STUDIO_SELECT_BY_ID_TIMEOUT_MS;
    let lastError = "";
    while (Date.now() < deadline) {
        await reopenMixtapeStudioIfNeeded(page);
        if (mixtapeId) {
            await ensureStudioMixtapeSelected(page, mixtapeId).catch(() => null);
        }
        const statusRow = mixtapeStatusRowLocator(page);
        const button = statusRow.getByRole("button", { name: buttonName });
        if (!(await button.isVisible().catch(() => false))) {
            lastError = `button not visible: ${buttonName}`;
            await page.waitForTimeout(250);
            continue;
        }
        const statusWait = page.waitForResponse(
            (r) => {
                const match = /\/api\/mixtapes\/[0-9a-f-]{36}$/i.test(r.url());
                if (!match) return false;
                return method === "DELETE" ? r.request().method() === "DELETE" : r.request().method() === "PATCH";
            },
            { timeout: Math.max(5_000, deadline - Date.now()) },
        );
        try {
            await Promise.all([statusWait, button.click()]);
            const res = await statusWait;
            return res.status();
        }
        catch (clickError) {
            lastError = clickError instanceof Error ? clickError.message : String(clickError);
            await page.waitForTimeout(250);
        }
    }
    throw new Error(`Studio status button unavailable (${buttonName}): ${lastError}`);
}

/**
 * @param {import("playwright").Page} page
 */
function coverPreviewLocator(page) {
    return page.locator('[data-mixtape-studio] [aria-label="Mixtape cover preview"]');
}

export async function waitForCoverPreviewBackground(page, timeout = STUDIO_SELECT_BY_ID_TIMEOUT_MS) {
    await page.waitForFunction(
        () => {
            const el = document.querySelector('[data-mixtape-studio] [aria-label="Mixtape cover preview"]');
            if (!el) return false;
            const bg = getComputedStyle(el).backgroundImage;
            return Boolean(bg && bg !== "none" && bg.includes("url("));
        },
        undefined,
        { timeout },
    );
}

export async function readCoverPreviewBackground(page) {
    const preview = coverPreviewLocator(page);
    if ((await preview.count()) === 0) return "none";
    return preview.evaluate((el) => getComputedStyle(el).backgroundImage).catch(() => "none");
}