import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const portalUrl = "https://timan-site.lovable.app/portal";
const configuratorUrl = "https://timan-site.lovable.app/configurator";
const tutorialRoot = path.resolve("tutorials/configure-3330");
const rawDir = path.join(tutorialRoot, "raw");
const rawVideo = path.join(rawDir, "configure-3330-poc.webm");
const profileDir = process.env.TIMAN_TUTORIAL_PROFILE_DIR
  || path.join(tmpdir(), "timan-tutorial-playwright-profile");

await mkdir(rawDir, { recursive: true });

async function openPersistentContext(recordVideo) {
  return chromium.launchPersistentContext(profileDir, {
    channel: "msedge",
    headless: false,
    viewport: { width: 1920, height: 1080 },
    recordVideo: recordVideo
      ? { dir: rawDir, size: { width: 1920, height: 1080 } }
      : undefined,
  });
}

async function ensureAuthenticated() {
  const context = await openPersistentContext(false);
  const page = context.pages()[0] || await context.newPage();
  await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const portalHeading = page.getByRole("heading", {
    name: "Velkommen til vores Timan site",
  });

  if (!(await portalHeading.isVisible().catch(() => false))) {
    console.log("LOGIN_REQUIRED: Complete the Timan login/MFA flow in the Playwright Edge window.");
    await portalHeading.waitFor({ state: "visible", timeout: 10 * 60_000 });
  }

  await context.close();
}

async function recordConfiguratorFlow() {
  const context = await openPersistentContext(true);
  const page = context.pages()[0] || await context.newPage();
  const video = page.video();

  await page.goto(configuratorUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Timan 3330", exact: true })).toBeVisible();
  await page.waitForTimeout(900);

  const machineCard = page
    .getByRole("heading", { name: "Timan 3330", exact: true })
    .locator("xpath=ancestor::*[.//button[normalize-space()='+']][1]");
  await machineCard.getByRole("button", { name: "+", exact: true }).click();
  await expect(page.getByText("Maskine 1 (Timan 3330)", { exact: true })).toBeVisible();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: /Gå til Leveringsdato/ }).click();
  await expect(page.getByRole("heading", { name: /Trin 2:/ })).toBeVisible();
  await page.waitForTimeout(700);

  const pickup = page.getByRole("radio", { name: /Afhentning på fabrik/ });
  await pickup.locator("xpath=ancestor::label").click();
  await expect(pickup).toBeChecked();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Start Udstyrskonfiguration/ }).click();
  await expect(page.getByRole("heading", { name: /Trin 3:/ })).toBeVisible();
  await page.waitForTimeout(700);

  const selections = [
    "Ønsker Aircondition, inkl. alm. ventilationssystem",
    "Dør højre og venstre med skyderude",
    "Stofsæde med luftaffjedring",
    "Tag med LED rotorblink",
    "Bakkamera monteret i kofanger",
  ];

  for (const selection of selections) {
    const option = page.getByText(selection, { exact: true });
    await option.scrollIntoViewIfNeeded();
    await option.click();
    await page.waitForTimeout(550);
  }

  const continueButton = page.getByRole("button", { name: /Gå til Kontaktinformation/ });
  await expect(continueButton).toBeEnabled();
  await continueButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await continueButton.click();
  const dependencyDialog = page.getByRole("dialog", { name: /Centerslange/ });
  if (await dependencyDialog.isVisible().catch(() => false)) {
    await dependencyDialog
      .getByRole("button", { name: "Fortsæt uden 721122", exact: true })
      .click();
  }
  await expect(page.getByRole("heading", { name: /Trin 4:/ })).toBeVisible();
  await page.waitForTimeout(1_500);

  if (!video) throw new Error("Playwright did not create a video artifact.");
  await page.close();
  await video.saveAs(rawVideo);
  await context.close();
  console.log(`RAW_VIDEO=${rawVideo}`);
}

await ensureAuthenticated();
await recordConfiguratorFlow();
