import { test, expect, type Page } from "@playwright/test";

/**
 * H-0c Blocker B — the autograph signature, in a REAL browser.
 *
 * The reported symptom is an asymmetry: the autograph is visible in the local
 * copy and missing from the official PDF. Every pre-existing signed fixture
 * points `signature_url` at `cdn.example.invalid`, so the autograph could only
 * ever render as SignatureBlock's fallback — the image path had no real-browser
 * coverage in either renderer.
 *
 * This spec drives both entry points against the SAME report snapshot:
 *
 *   LOCAL    /?fixture=<key>                  -> ReportRendererResolver, the
 *                                               editor/detail preview and the
 *                                               source the local print copy clones
 *   OFFICIAL /?internal_render=1&fixture=<key> -> InternalReportRender, the exact
 *                                               route the backend's headless
 *                                               Chromium navigates to for the PDF
 *
 * Asserting on rendering rather than on JSON: a `signature_url` present in the
 * payload proved nothing about whether the autograph reached the page, which is
 * precisely how this defect class stays invisible.
 */

const AUTOGRAPH_ALT = "Firma digital del revisor";

/** Intrinsic dimensions are the only honest proof an image DECODED. `complete`
 *  alone is true for a failed load too — that is exactly the distinction the
 *  official render path's readiness check deliberately does not make, so a test
 *  that used `complete` would pass on a broken autograph. */
async function autographState(page: Page) {
    return page.evaluate((alt) => {
        const img = document.querySelector<HTMLImageElement>(`img[alt="${alt}"]`);
        if (!img) return { present: false, complete: false, naturalWidth: 0, naturalHeight: 0 };
        return {
            present: true,
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
        };
    }, AUTOGRAPH_ALT);
}

async function openLocal(page: Page, fixture: string) {
    await page.goto(`/?fixture=${fixture}`);
    await page.waitForSelector("#report-render-host, [data-report-root]", { timeout: 15000 })
        .catch(() => undefined);
    // The local harness has no readiness flag; settle on the signature section.
    await page.waitForTimeout(300);
}

async function openOfficial(page: Page, fixture: string) {
    await page.goto(`/?internal_render=1&fixture=${fixture}`);
    // The backend waits on exactly this selector before calling page.pdf().
    await page.waitForSelector('html[data-report-ready="true"]', { timeout: 15000 });
}

test.describe("autograph parity — local vs official", () => {
    test("LOCAL renders and decodes the autograph", async ({ page }) => {
        await openLocal(page, "v2SignedWithAutograph");
        const state = await autographState(page);
        expect(state.present, "autograph <img> missing from the local render").toBe(true);
        expect(state.naturalWidth, "autograph did not decode in the local render").toBeGreaterThan(0);
        expect(state.naturalHeight).toBeGreaterThan(0);
    });

    test("OFFICIAL renders and decodes the autograph", async ({ page }) => {
        await openOfficial(page, "v2SignedWithAutograph");
        const state = await autographState(page);
        expect(state.present, "autograph <img> missing from the official render").toBe(true);
        expect(state.naturalWidth, "autograph did not decode in the official render").toBeGreaterThan(0);
        expect(state.naturalHeight).toBeGreaterThan(0);
    });

    test("both paths agree on autograph visibility for the same snapshot", async ({ page }) => {
        await openLocal(page, "v2SignedWithAutograph");
        const local = await autographState(page);
        await openOfficial(page, "v2SignedWithAutograph");
        const official = await autographState(page);

        // The asymmetry Blocker B describes, stated as an equality.
        expect(
            { present: official.present, decoded: official.naturalWidth > 0 },
            "local and official disagree about the autograph",
        ).toEqual({ present: local.present, decoded: local.naturalWidth > 0 });
    });
});

test.describe("a required autograph that fails to load refuses the render", () => {
    /**
     * Before H-0c this was the silent path: the broken <img> stayed in the DOM
     * at zero width (measured: naturalWidth 0 in a 153px box), readiness fired
     * anyway, and the backend captured a PDF with an empty box where the
     * signature belongs — a clinical document that reads as signed but shows
     * no signature. SignatureBlock's documented "falls back gracefully"
     * behaviour did NOT engage: `onError` never withdrew the image.
     *
     * The official route now refuses instead, so publication fails loudly and
     * the report stays APPROVED and retryable.
     */
    test("signals a render error instead of readiness", async ({ page }) => {
        await page.goto(`/?internal_render=1&fixture=v2SignedBrokenAutograph`);
        await page.waitForSelector("html[data-report-render-error]", { timeout: 15000 });

        const code = await page.getAttribute("html", "data-report-render-error");
        expect(code).toBe("SIGNATURE_NOT_LOADED");
        // The backend waits on this flag; it must never appear for this report.
        expect(await page.getAttribute("html", "data-report-ready")).toBeNull();
    });

    test("a loadable autograph still signals readiness and no error", async ({ page }) => {
        await openOfficial(page, "v2SignedWithAutograph");
        expect(await page.getAttribute("html", "data-report-render-error")).toBeNull();
    });

    test("a report that does not require a digital signature renders normally in both paths", async ({ page }) => {
        // The absence that is legitimate: signed, but not digitally. It must
        // NOT be caught by the refusal above.
        await openLocal(page, "v2SignedNoDigitalRequirement");
        expect((await autographState(page)).present).toBe(false);

        await openOfficial(page, "v2SignedNoDigitalRequirement");
        expect((await autographState(page)).present).toBe(false);
        expect(await page.getAttribute("html", "data-report-render-error")).toBeNull();
        expect(await page.locator("text=/Firmado el/i").count()).toBeGreaterThan(0);
    });
});

test.describe("the autograph survives into the PDF itself", () => {
    /** Chromium's own page.pdf() — the same call ReportPdfGenerationService
     *  makes. Text extraction cannot prove an autograph (it is an image), so
     *  this counts embedded image XObjects in the produced PDF. */
    async function imageXObjectCount(page: Page): Promise<number> {
        const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        const raw = buf.toString("latin1");
        return (raw.match(/\/Subtype\s*\/Image/g) ?? []).length;
    }

    test("PDF produced from the official route embeds an image when the autograph loads", async ({ page }) => {
        await openOfficial(page, "v2SignedWithAutograph");
        expect((await autographState(page)).naturalWidth).toBeGreaterThan(0);
        expect(
            await imageXObjectCount(page),
            "the produced PDF embeds no image at all, so it cannot contain the autograph",
        ).toBeGreaterThan(0);
    });

    test("a report with no digital-signature requirement embeds fewer images", async ({ page }) => {
        await openOfficial(page, "v2SignedWithAutograph");
        const withAutograph = await imageXObjectCount(page);
        await openOfficial(page, "v2SignedNoDigitalRequirement");
        const withoutAutograph = await imageXObjectCount(page);
        // Isolates the autograph as the differing image: these two fixtures
        // are the same report apart from the signature requirement.
        expect(withAutograph).toBeGreaterThan(withoutAutograph);
    });
});

test.describe("the official PDF of a report being signed (H-0c root cause)", () => {
    /**
     * The state the official renderer is served DURING `sign-and-publish` — the
     * only moment that matters, and the one no fixture modelled before.
     *
     * `v2MidPublicationSigned` is what the render-data endpoint returns now:
     * still APPROVED, not yet published, but carrying the publish claim as the
     * effective signature state. `v2MidPublicationUnsigned` is what it returned
     * before the fix. The pair is the defect and its remedy, side by side, in a
     * real browser and a real PDF.
     */
    async function imageXObjects(page: Page): Promise<number> {
        const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        return (buf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
    }

    test("NORMAL SUCCESS: the autograph is drawn and reaches the PDF", async ({ page }) => {
        await openOfficial(page, "v2MidPublicationSigned");

        const state = await autographState(page);
        expect(state.present, "no autograph in the official render").toBe(true);
        expect(state.naturalWidth, "the autograph did not decode").toBeGreaterThan(0);
        // The caption a signed clinical document must carry.
        expect(await page.locator("text=/Firmado digitalmente el/i").count()).toBeGreaterThan(0);
        expect(await imageXObjects(page), "the PDF embeds no image").toBeGreaterThan(0);
    });

    test("THE DEFECT: served as unsigned, the same report renders no autograph", async ({ page }) => {
        await openOfficial(page, "v2MidPublicationUnsigned");

        // Identical report, identical loadable signature_url — the ONLY
        // difference is whether the renderer was told it is signed.
        const state = await autographState(page);
        expect(state.present, "this is the bug: no autograph without signed_at").toBe(false);
        expect(await page.locator("text=/Firmado digitalmente el/i").count()).toBe(0);
    });

    test("the two differ by exactly one embedded image", async ({ page }) => {
        await openOfficial(page, "v2MidPublicationSigned");
        const signed = await imageXObjects(page);
        await openOfficial(page, "v2MidPublicationUnsigned");
        const unsigned = await imageXObjects(page);
        expect(signed).toBeGreaterThan(unsigned);
    });
});
