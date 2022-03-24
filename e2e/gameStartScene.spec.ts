import { test, expect } from "@playwright/test";
import axios from "axios";

test.describe("FR1 - Game.StartScene", () => {
    test.beforeEach(async ({ page }) => {
        await axios.get("http://localhost:3001/restart"); // server re-initialize
        await openClient(page);
    });

    test("page can load", async ({ page }) => {
        await expect(page).toHaveURL("http://localhost:3000/");
    });

    test("waiting room screen", async ({ page }) => {
        await page.waitForTimeout(1000);
        expect(await page.screenshot()).toMatchSnapshot();
    });

    test("can join as a player", async ({ page }) => {
        await page.waitForTimeout(1000);
        // waiting for 4 players
        expect(await page.screenshot()).toMatchSnapshot();
        await pageClickOnJoin(page);
        await page.waitForTimeout(100);
        // waiting for 3 players
        expect(await page.screenshot()).toMatchSnapshot();
    });

    test("start game when all ready", async ({ context }) => {
        const [p1, p2, p3, p4] = await Promise.all([
            openClient(await context.newPage()),
            openClient(await context.newPage()),
            openClient(await context.newPage()),
            openClient(await context.newPage()),
        ]);
        await p1.waitForTimeout(1000);
        // waiting for 4 players
        expect(await p1.screenshot()).toMatchSnapshot();

        await Promise.all([
            pageClickOnJoin(p1),
            pageClickOnJoin(p2),
            pageClickOnJoin(p3),
        ]);
        await p1.waitForTimeout(100);

        // waiting for 1 player
        expect(await p1.screenshot()).toMatchSnapshot();

        await pageClickOnJoin(p4);
        await p1.waitForTimeout(500);

        // entering new scene
        // 0.15 because (4 blocks) x (4 players) / (40x40 board size) = 0.01
        expect(await p1.screenshot()).toMatchSnapshot({
            maxDiffPixelRatio: 0.02,
        });
    });
});

async function openClient(page) {
    await page.setViewportSize({ width: 800, height: 800 });
    await page.goto("http://localhost:3000/");
    return page;
}

async function pageClickOnJoin(page) {
    await page.focus("#root");
    await page.mouse.move(400, 400);
    await page.mouse.click(400, 400, { delay: 50 });
}
