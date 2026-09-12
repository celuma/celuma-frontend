import { test, expect, type Page } from "@playwright/test";

/**
 * Céluma 1.3.1 Block E (CEL-131-10) — long sample names must not overlap
 * patient information.
 *
 * The defect only exists in a layout engine. In the DOM nothing was wrong: the
 * chip row was `position: absolute; top: 16; right: 20` and the patient name
 * was the first element in the normal flow. They occupied the same band of the
 * card, and a long sample name simply grew leftwards until it was painted over
 * the name — jsdom, which computes no geometry, reported both as present and
 * correct throughout.
 *
 * So these tests measure boxes. The core assertion is a real intersection
 * test between the chip row and the patient's name and code, repeated at every
 * width the screen supports. Run against the pre-fix component, the desktop
 * cases below fail with a real overlap.
 *
 * Deliberately not screenshots: "do these two rectangles intersect" is the
 * actual acceptance criterion, and a golden PNG would answer a different,
 * fuzzier question at a 2% pixel tolerance.
 */

type Box = { x: number; y: number; width: number; height: number };

/** Every width the sample and order detail screens are expected to work at. */
const WIDTHS = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "narrow desktop", width: 1024, height: 800 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
];

/** Sample codes, from a short code to the customer's descriptive name. */
const CODES = ["short", "typical", "long", "unbroken"];

async function boxOf(page: Page, testId: string): Promise<Box> {
    const box = await page.locator(`[data-testid="${testId}"]`).boundingBox();
    expect(box, `no box for ${testId}`).not.toBeNull();
    return box!;
}

async function chipRowBox(page: Page): Promise<Box> {
    const box = await page.locator(".cf-chips").boundingBox();
    expect(box, "no chip row").not.toBeNull();
    return box!;
}

function intersects(a: Box, b: Box): boolean {
    return (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
    );
}

for (const { name: widthName, width, height } of WIDTHS) {
    test.describe(`${widthName} (${width}px)`, () => {
        test.use({ viewport: { width, height } });

        for (const code of CODES) {
            test(`sample code "${code}" never overlaps the patient's name or code`, async ({ page }) => {
                await page.goto(`/?record_card=${code}`);
                await page.waitForSelector('[data-ready="true"]');

                const chips = await chipRowBox(page);
                const patientName = await boxOf(page, "patient-name");
                const patientCode = await boxOf(page, "patient-code");

                expect(
                    intersects(chips, patientName),
                    `the chip row overlaps the patient's name (chips ${JSON.stringify(chips)}, name ${JSON.stringify(patientName)})`,
                ).toBe(false);
                expect(intersects(chips, patientCode), "the chip row overlaps the patient's code").toBe(false);
            });

            test(`sample code "${code}" stays inside the card and stays fully readable`, async ({ page }) => {
                await page.goto(`/?record_card=${code}`);
                await page.waitForSelector('[data-ready="true"]');

                const chip = page.locator('[data-testid="code-chip"]');
                const chipBox = (await chip.boundingBox())!;
                const card = (await page.locator(".ant-card").first().boundingBox())!;

                // Wrapping, not overflow: the chip is bounded by its card.
                expect(chipBox.x).toBeGreaterThanOrEqual(card.x - 1);
                expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(card.x + card.width + 1);

                // …and nothing is clipped or ellipsised away: the full value is
                // rendered, because a sample name is clinical text.
                const overflow = await chip.evaluate((el) => ({
                    clippedX: el.scrollWidth > el.clientWidth + 1,
                    clippedY: el.scrollHeight > el.clientHeight + 1,
                    textOverflow: getComputedStyle(el).textOverflow,
                }));
                expect(overflow.clippedX).toBe(false);
                expect(overflow.clippedY).toBe(false);
                expect(overflow.textOverflow).not.toBe("ellipsis");
            });
        }

        test("the page itself never scrolls sideways", async ({ page }) => {
            await page.goto("/?record_card=unbroken");
            await page.waitForSelector('[data-ready="true"]');
            const overflowsX = await page.evaluate(
                () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            );
            expect(overflowsX).toBe(false);
        });
    });
}

test.describe("the long name is accommodated, not hidden", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("a long name grows the chip, and the patient's name neither moves nor shrinks", async ({ page }) => {
        await page.goto("/?record_card=short");
        await page.waitForSelector('[data-ready="true"]');
        const shortName = await boxOf(page, "patient-name");
        const shortChip = await boxOf(page, "code-chip");
        const shortRow = await chipRowBox(page);

        await page.goto("/?record_card=long");
        await page.waitForSelector('[data-ready="true"]');
        const longName = await boxOf(page, "patient-name");
        const longChip = await boxOf(page, "code-chip");
        const longRow = await chipRowBox(page);

        // The chip itself absorbs the extra text…
        expect(longChip.width).toBeGreaterThan(shortChip.width);
        // …growing leftwards from the row's right edge, exactly as before. The
        // difference is that it is now growing inside a row of its own.
        expect(Math.abs(shortRow.height - longRow.height)).toBeLessThanOrEqual(1);
        // …so the patient's name does not move…
        expect(Math.abs(longName.y - shortName.y)).toBeLessThanOrEqual(1);
        // …and is not squeezed by it either.
        expect(Math.abs(longName.width - shortName.width)).toBeLessThanOrEqual(1);
    });

    test("the full sample name is present in the accessibility tree", async ({ page }) => {
        await page.goto("/?record_card=long");
        await page.waitForSelector('[data-ready="true"]');
        await expect(page.locator('[data-testid="code-chip"]')).toHaveText(
            "Biopsia incisional de lesión pigmentada en región escapular derecha — fragmento A",
        );
    });
});

test.describe("when the row has to wrap, it pushes the badge down rather than covering it", () => {
    // Narrow enough that the descriptive sample name cannot share one line
    // with the status chip — the case that used to paint over the patient.
    test.use({ viewport: { width: 560, height: 900 } });

    test("the badge moves down by exactly the extra rows the chips needed", async ({ page }) => {
        await page.goto("/?record_card=short");
        await page.waitForSelector('[data-ready="true"]');
        const shortRow = await chipRowBox(page);
        const shortBadge = (await page.locator(".cf-badge").boundingBox())!;

        await page.goto("/?record_card=long");
        await page.waitForSelector('[data-ready="true"]');
        const longRow = await chipRowBox(page);
        const longBadge = (await page.locator(".cf-badge").boundingBox())!;
        const longName = await boxOf(page, "patient-name");

        // The row is taller because the chip wrapped…
        expect(longRow.height).toBeGreaterThan(shortRow.height);
        // …the badge started lower by the same amount…
        const rowGrowth = longRow.height - shortRow.height;
        expect(Math.abs((longBadge.y - shortBadge.y) - rowGrowth)).toBeLessThanOrEqual(2);
        // …and the patient's name sits entirely below the chips, never under them.
        expect(longName.y).toBeGreaterThanOrEqual(longRow.y + longRow.height - 1);
    });
});
