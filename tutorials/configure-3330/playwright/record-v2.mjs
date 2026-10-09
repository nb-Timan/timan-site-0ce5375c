import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const portalUrl = "https://timan-site.lovable.app/portal";
const configuratorUrl = "https://timan-site.lovable.app/configurator";
const tutorialRoot = path.resolve("tutorials/configure-3330");
const rawDir = path.join(tutorialRoot, "raw");
const rawVideo = path.join(rawDir, "configure-3330-v2-raw.webm");
const eventLog = path.join(rawDir, "configure-3330-v2-events.json");
const profileDir = process.env.TIMAN_TUTORIAL_PROFILE_DIR
  || path.join(tmpdir(), "timan-tutorial-playwright-profile");
const testRecipient = "test+timan@example.com";

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

async function installTutorialCursor(page) {
  await page.addInitScript(() => {
    const install = () => {
      if (document.getElementById("__timan-tutorial-cursor")) return;

      const style = document.createElement("style");
      style.id = "__timan-tutorial-cursor-style";
      style.textContent = `
        #__timan-tutorial-cursor {
          position: fixed;
          left: 0;
          top: 0;
          width: 25px;
          height: 25px;
          z-index: 2147483646;
          pointer-events: none;
          border: 3px solid #ffffff;
          border-radius: 50%;
          background: rgba(22, 134, 66, 0.9);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
          transform: translate(-50%, -50%);
          transition: width 100ms ease, height 100ms ease, background 100ms ease;
        }
        #__timan-tutorial-cursor.is-clicking {
          width: 19px;
          height: 19px;
          background: #f4d03f;
        }
        .__timan-tutorial-ripple {
          position: fixed;
          z-index: 2147483645;
          width: 18px;
          height: 18px;
          pointer-events: none;
          border: 4px solid rgba(244, 208, 63, 0.95);
          border-radius: 50%;
          transform: translate(-50%, -50%) scale(0.4);
          animation: __timan-ripple 520ms ease-out forwards;
        }
        @keyframes __timan-ripple {
          to { opacity: 0; transform: translate(-50%, -50%) scale(4.2); }
        }
      `;

      const cursor = document.createElement("div");
      cursor.id = "__timan-tutorial-cursor";
      cursor.setAttribute("aria-hidden", "true");
      document.head.append(style);
      document.body.append(cursor);

      window.addEventListener("pointermove", (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      }, true);

      window.addEventListener("pointerdown", (event) => {
        cursor.classList.add("is-clicking");
        const ripple = document.createElement("div");
        ripple.className = "__timan-tutorial-ripple";
        ripple.style.left = `${event.clientX}px`;
        ripple.style.top = `${event.clientY}px`;
        document.body.append(ripple);
        window.setTimeout(() => ripple.remove(), 600);
      }, true);

      window.addEventListener("pointerup", () => {
        cursor.classList.remove("is-clicking");
      }, true);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
      install();
    }
  });
}

async function recordConfiguratorFlow() {
  const context = await openPersistentContext(true);
  const page = context.pages()[0] || await context.newPage();
  const video = page.video();
  const events = [];
  const startedAt = Date.now();
  const mark = (name) => events.push({ name, seconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)) });
  const editorialPause = (milliseconds) => page.waitForTimeout(milliseconds);

  await installTutorialCursor(page);
  await page.goto(configuratorUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Timan 3330", exact: true })).toBeVisible();

  const lovableBadgeClose = page.getByRole("button", { name: "Dismiss", exact: true });
  if (await lovableBadgeClose.isVisible().catch(() => false)) await lovableBadgeClose.click();

  async function pointAt(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error("Tutorial target has no visible bounding box.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await editorialPause(120);
  }

  async function tutorialClick(locator, pauseAfter = 420) {
    await pointAt(locator);
    await locator.click();
    await editorialPause(pauseAfter);
  }

  async function selectOptionCard(label, pauseAfter = 480) {
    const option = page.getByText(label, { exact: true });
    await tutorialClick(option, pauseAfter);
  }

  mark("tutorial-start");
  await editorialPause(2_300);

  const machineCard = page
    .getByRole("heading", { name: "Timan 3330", exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await tutorialClick(machineCard.getByRole("button", { name: "+", exact: true }), 1_500);
  await expect(page.getByText("Maskine 1 (Timan 3330)", { exact: true })).toBeVisible();
  mark("machine-selected");

  await tutorialClick(page.getByRole("button", { name: /Gå til Leveringsdato/ }), 700);
  await expect(page.getByRole("heading", { name: /Trin 2:/ })).toBeVisible();
  await tutorialClick(page.getByRole("button", { name: "Ønsket Leveringsdato", exact: true }), 250);
  for (let month = 0; month < 4; month += 1) {
    await tutorialClick(page.getByRole("button", { name: "Go to next month", exact: true }), 180);
  }

  let deliveryDay = null;
  for (const day of [16, 15, 17, 18, 19]) {
    const candidate = page.getByRole("gridcell", { name: String(day), exact: true });
    if (await candidate.count() === 1 && await candidate.isEnabled()) {
      deliveryDay = candidate;
      break;
    }
  }
  if (!deliveryDay) throw new Error("No enabled business day found in target delivery month.");
  await tutorialClick(deliveryDay, 600);
  await expect(page.getByText(/2% leveringsrabat aktiveret/)).toBeVisible();
  mark("delivery-discount");
  await editorialPause(3_000);

  const pickupLabel = page.getByText("Afhentning på fabrik (AB Fabrik)", { exact: true });
  await tutorialClick(pickupLabel, 500);
  await expect(page.getByRole("radio", { name: /Afhentning på fabrik/ })).toBeChecked();

  await tutorialClick(page.getByRole("button", { name: "Trin 1", exact: true }), 650);
  const rc751Card = page
    .getByRole("heading", { name: "RC-751 Basismaskine", exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await tutorialClick(rc751Card.getByRole("button", { name: "+", exact: true }), 850);
  await expect(page.getByText(/Stk\. rabat \(2%\)/)).toBeVisible();
  mark("quantity-discount");
  await editorialPause(3_000);

  await tutorialClick(page.getByRole("button", { name: /Gå til Leveringsdato/ }), 450);
  await tutorialClick(page.getByText("Afhentning på fabrik (AB Fabrik)", { exact: true }), 350);
  await tutorialClick(page.getByRole("button", { name: /Start Udstyrskonfiguration/ }), 800);
  await expect(page.getByRole("heading", { name: /Trin 3:/ })).toBeVisible();
  mark("equipment-start");

  const selections = [
    "Ønsker Aircondition, inkl. alm. ventilationssystem",
    "Dør højre og venstre med fast rude",
    "Stofsæde med luftaffjedring",
    "Tag med LED rotorblink",
    "Monitor for kamera",
    "Kamera for sugemundstykke",
    "Bakkamera monteret i kofanger",
    "Kombitræk kugle/gaffel",
    "T2 Opsamlingstank inkl. højtryksrenser",
    "Ekstra vogn til afmontering af redskaber",
    "Forkostesæt med 2 koste til fejesug forberedt til venstre og højre sidekost",
    "Centerdrevet fejemaskine med reversering, 120 cm, Ø550 mm børster",
    "Rustbeskyttelse Centerdrevet fejemaskine",
  ];

  for (const selection of selections) await selectOptionCard(selection);

  const quantityInput = (label) => page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"items-center")][1]//input');

  const sideBrushArm = quantityInput("Sidebørste arm højre/venstre med vanddyse");
  await pointAt(sideBrushArm);
  await sideBrushArm.fill("2");
  await sideBrushArm.press("Tab");
  await editorialPause(450);

  const lowNoiseBrush = quantityInput("Børste for sidekost (Low noise)");
  await pointAt(lowNoiseBrush);
  await lowNoiseBrush.fill("2");
  await lowNoiseBrush.press("Tab");
  await editorialPause(1_100);
  mark("equipment-selected");

  await tutorialClick(page.getByRole("button", { name: /Næste Maskine/ }), 250);
  const dependencyDialog = page.getByRole("dialog", { name: /Centerslange/ });
  await expect(dependencyDialog).toBeVisible();
  mark("centerslange-open");
  await editorialPause(3_500);
  await tutorialClick(
    dependencyDialog.getByRole("button", { name: "Tilføj 721122", exact: true }),
    500,
  );
  if (await dependencyDialog.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await expect(page.getByText(/Fabriksmontering af centerslange for fejesug T2 og T3/).last()).toBeVisible();
  mark("centerslange-added");

  await tutorialClick(page.getByRole("button", { name: "Maskine 2", exact: true }), 500);
  await expect(page.getByRole("heading", { name: "Udstyr til RC-751", exact: true })).toBeVisible();
  await tutorialClick(page.getByRole("button", { name: /Gå til Kontaktinformation/ }), 800);
  await expect(page.getByRole("heading", { name: /Trin 4:/ })).toBeVisible();
  mark("assignment-start");

  const main = page.locator("main");
  const sellerSelect = main.getByRole("combobox").first();
  await pointAt(sellerSelect);
  await sellerSelect.selectOption({ label: "EM Sælger" });
  await editorialPause(750);

  await tutorialClick(main.getByRole("button", { name: "— Ingen valgt —", exact: true }), 350);
  const dealerSearch = main.getByPlaceholder("Søg forhandler (nr. eller navn)…", { exact: true });
  await pointAt(dealerSearch);
  await dealerSearch.fill("AB Lauridsen");
  await editorialPause(700);
  await tutorialClick(page.getByRole("button", { name: /AB Lauridsen Maskiner ApS/ }), 850);

  const useDealerButton = main.getByRole("button", {
    name: "Brug forhandlerens oplysninger",
    exact: true,
  });
  await expect(useDealerButton).toBeEnabled({ timeout: 15_000 });
  await tutorialClick(useDealerButton, 800);

  const contactSelect = main.getByRole("combobox").nth(2);
  await expect(contactSelect.getByRole("option", { name: "Lucas Skovrød · Sælger", exact: true })).toBeAttached();
  await pointAt(contactSelect);
  await contactSelect.selectOption({ label: "Lucas Skovrød · Sælger" });
  await editorialPause(700);

  const recipient = main.getByPlaceholder("Modtagers e-mail", { exact: true });
  await pointAt(recipient);
  await recipient.fill(testRecipient);
  await recipient.press("Tab");
  await editorialPause(1_100);
  mark("customer-ready");

  const orderButton = page
    .getByRole("group", { name: "flow type" })
    .getByRole("button", { name: "Ordre", exact: true });
  await tutorialClick(orderButton, 800);
  await expect(orderButton).toHaveAttribute("aria-pressed", "true");
  mark("order-selected");
  await editorialPause(2_500);

  const nextButton = main.getByRole("button", { name: "Næste", exact: true });
  await expect(nextButton).toBeEnabled();
  await tutorialClick(nextButton, 600);
  await expect(page.getByRole("heading", { name: "ORDREBEKRÆFTELSE", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Afsend ordre til Timan", exact: true })).toBeVisible();
  mark("confirmation-open");
  await editorialPause(7_000);

  mark("recording-end");
  await writeFile(eventLog, `${JSON.stringify({
    viewport: { width: 1920, height: 1080 },
    testRecipient,
    submitted: false,
    events,
  }, null, 2)}\n`, "utf8");

  if (!video) throw new Error("Playwright did not create a video artifact.");
  await page.close();
  await video.saveAs(rawVideo);
  await context.close();

  console.log(`RAW_VIDEO=${rawVideo}`);
  console.log(`EVENT_LOG=${eventLog}`);
  console.log("ORDER_SUBMITTED=false");
}

await ensureAuthenticated();
await recordConfiguratorFlow();
