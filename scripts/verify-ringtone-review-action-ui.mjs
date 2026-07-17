/**
 * Static + behavioral checks for Ringtone Review Queue action buttons
 * and creator checkbox touch targets.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

const review = read("components/ringtone-review/ringtone-review-queue.tsx");
const creator = read("components/ringtone-creator/ringtone-creator-workspace.tsx");

record("review file present", existsSync(path.join(root, "components/ringtone-review/ringtone-review-queue.tsx")));
record("semantic buttons", (review.match(/<button\b/g) || []).length >= 8);
record("button class system", review.includes("rrq-btn") && review.includes("rrq-btn-approve") && review.includes("rrq-btn-reject"));
record("preview secondary style", review.includes("rrq-btn-secondary") && review.includes("rrq-btn-media"));
record("archive style", review.includes("rrq-btn-archive"));
record("reprocess style", review.includes("rrq-btn-reprocess"));
record("visible borders", review.includes("border: 1px solid") || review.includes("border-color"));
record("touch target 44px", review.includes("min-height: 44px") && review.includes("min-width: 44px"));
record("hover state", review.includes(":hover:not(:disabled)"));
record("focus state", review.includes(":focus-visible"));
record("disabled state", review.includes(":disabled") && review.includes("actionsDisabled"));
record("loading busy state", review.includes("aria-busy") && review.includes("busyKey"));
record("accessible labels", review.includes("aria-label") && review.includes("approveRingtone") && review.includes("rejectRingtone"));
record("keyboard native buttons", review.includes('type="button"') && !/<div[^>]*onClick=\{[^}]*approve/.test(review));
record("wrap-friendly actions", review.includes("flex-wrap: wrap") && review.includes("ringtone-review-actions"));
record("player clearance", review.includes("--mobile-player-reserve"));
record("duplicate click lock", review.includes("actionLockRef") && review.includes("if (actionLockRef.current || pending) return"));
record("reject confirmation dialog", review.includes('role="dialog"') && review.includes("rejectTarget") && review.includes("rejectionReason"));
record("archive confirmation", review.includes('action: "archive"') && review.includes("confirmAction"));
record("reprocess confirmation", review.includes('action: "reprocess"') && review.includes("requestReprocessing"));
record("reject requires reason", review.includes("rejectionReasonRequired") && review.includes("!rejectReason.trim()"));
record("visible success message", review.includes("ringtone-review-success") && review.includes('data-ringtone-review="success"'));
record("approve keeps on all/approved", review.includes("shouldKeepAfterStatusChange") && review.includes('filter === "all"'));
record("approve removes only pending filter", review.includes("pending_review") && review.includes("applyLocalActionResult"));
record("preserve admin client", review.includes("performRingtoneReviewAction"));

record("creator checkbox labels", creator.includes('htmlFor="ringtone-iphone-ready"') && creator.includes('htmlFor="ringtone-android-ready"') && creator.includes('htmlFor="ringtone-ownership-details"'));
record("checkbox stack spacing", creator.includes("ringtone-checkbox-stack") && creator.includes("gap: 12px"));
record("checkbox touch row 48px", creator.includes("min-height: 48px"));
record("checkbox visible size 24px", creator.includes("width: 24px") && creator.includes("height: 24px"));
record("checkbox focus/hover/checked", creator.includes(".ringtone-checkbox:hover") && creator.includes(":checked") && creator.includes(":focus-within"));
record("ownership still required", creator.includes("ownershipRequired") && creator.includes("!form.ownershipConfirmed"));
record("iphone/android independent", creator.includes("iphoneAvailable") && creator.includes("androidAvailable"));
record("creator player clearance", creator.includes("--mobile-player-reserve"));

record("filter includes processing", review.includes('"processing"') && review.includes("ringtones.processing"));
record("filter includes all statuses", ["pending_review", "approved", "published", "rejected", "suspended", "archived", "processing_failed"].every((k) => review.includes(`"${k}"`) || review.includes(`'${k}'`)));
record("sort submission labels", review.includes("sortOldestSubmission") && review.includes("sortNewestSubmission"));
record("select contrast styles", review.includes("color-scheme: light") && review.includes(".ringtone-review-select option") && review.includes("background-color: #ffffff") && review.includes("color: #111827"));
record("select closed contrast", review.includes("background-color: #08122b") && review.includes("color: #e8f7ff"));
record("no empty option labels", !review.includes(">{/*") && review.includes("label={label}"));
record("publish success message", review.includes("publishRingtone") && review.includes('action === "publish"'));

const marketplace = read("app/api/ringtones/marketplace/route.ts");
record(
        "marketplace optional number parse",
        marketplace.includes("parseOptionalNumber")
            && !marketplace.includes('Number(url.searchParams.get("minPriceCents") || "")')
            && !marketplace.includes("Number(url.searchParams.get('minPriceCents') || '')"),
    );
record("marketplace ignores empty max price", marketplace.includes("parseOptionalNumber(url.searchParams.get(\"maxPriceCents\"))") || marketplace.includes("parseOptionalNumber(url.searchParams.get('maxPriceCents'))"));
record("marketplace requires published_at", marketplace.includes('.not("published_at", "is", null)') || marketplace.includes(".not('published_at', 'is', null)"));

const failed = results.filter((r) => !r.ok);
console.log(`\nRingtone review/checkbox UI: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
