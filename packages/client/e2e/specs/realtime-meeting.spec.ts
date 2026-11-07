import type { APIResponse, WebSocketRoute } from "@playwright/test";
import { expect, test } from "../fixtures/application";
import { establishRevision, generateCurrentNotice } from "../fixtures/meetingPreparation";

interface SirenItem<T> {
  properties: T;
}

interface SirenCollection<T> {
  entities: Array<SirenItem<T>>;
}

async function properties<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as SirenItem<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.properties;
}

async function items<T>(response: APIResponse): Promise<T[]> {
  const body = (await response.json()) as SirenCollection<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.entities.map((entity) => entity.properties);
}

// @verifies-requirement HALL-FR-MTG-320
test("a second conducting session receives conduct events, keeps its selection and rereads after reconnecting", async ({
  appPage: conductor,
  browser,
}) => {
  test.setTimeout(120_000);
  const meetings = await items<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await conductor.request.get("/api/council-meetings"),
  );
  const meeting = meetings.find((candidate) => !candidate.startedAt && !candidate.closedAt);
  expect(meeting).toBeTruthy();
  const scheduled = await properties<{ slug: string }>(
    await conductor.request.put(`/api/council-meetings/${meeting!.id}/schedule`, {
      data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "Live follow test" },
    }),
  );
  const businesses = await items<{ id: string }>(await conductor.request.get("/api/council-business"));
  expect(businesses.length).toBeGreaterThanOrEqual(2);
  const scheduleItem = async (councilBusinessId: string, position: number) =>
    properties<{ id: string }>(
      await conductor.request.post(`/api/council-meetings/${scheduled.slug}/agenda-items`, {
        data: { kind: "openQuestion", councilBusinessId, position },
      }),
    );
  const first = await scheduleItem(businesses[0]!.id, 1);
  const second = await scheduleItem(businesses[1]!.id, 2);

  await conductor.goto(`/app/meetings/${scheduled.slug}`);
  await establishRevision(conductor);
  const noticeResponse = conductor.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/notices"),
  );
  await generateCurrentNotice(conductor);
  expect((await noticeResponse).ok()).toBeTruthy();
  await conductor.goto(`/app/meetings/${scheduled.slug}/live`);
  await conductor.getByTestId("live-attendance-all-present").click();
  const members = await items<{ id: string }>(await conductor.request.get("/api/council-members"));
  await conductor.getByTestId(`live-member-actions-${members[0]!.id}`).click();
  await conductor.getByTestId(`live-designate-chair-${members[0]!.id}`).click();
  await conductor.getByTestId(`live-member-actions-${members[1]!.id}`).click();
  await conductor.getByTestId(`live-designate-secretary-${members[1]!.id}`).click();
  await expect(conductor.getByTestId("live-meeting-start")).toBeEnabled();
  await conductor.getByTestId("live-meeting-start").click();
  await expect(conductor.getByTestId(`live-agenda-item-${first.id}`)).toBeVisible();

  const followerContext = await browser.newContext();
  const follower = await followerContext.newPage();
  const sockets: WebSocketRoute[] = [];
  const received: string[] = [];
  let resumeReconnect: (() => void) | null = null;
  const reconnectGate = new Promise<void>((resolve) => {
    resumeReconnect = resolve;
  });
  try {
    await followerContext.routeWebSocket(
      (url) => url.pathname === "/api/live" && url.searchParams.get("kind") === "meeting",
      async (socket) => {
        sockets.push(socket);
        if (sockets.length > 1) await reconnectGate;
        const upstream = socket.connectToServer();
        upstream.onMessage((message) => {
          received.push(String(message));
          socket.send(message);
        });
      },
    );
    await follower.goto(`/app/meetings/${scheduled.slug}/live`);
    await expect(follower.getByTestId(`live-agenda-item-${first.id}`)).toBeVisible();
    await expect.poll(() => sockets.length).toBe(1);

    await follower.getByTestId(`live-agenda-item-${second.id}`).click();
    await expect(follower.getByTestId(`live-agenda-item-${second.id}`)).toHaveAttribute("aria-current", "true");
    await conductor.getByTestId(`live-agenda-item-${first.id}`).click();
    await conductor.getByTestId("live-agenda-start").click();
    await expect.poll(() => received.some((message) => JSON.parse(message).type === "meeting.changed")).toBe(true);
    await expect(follower.getByTestId(`live-agenda-item-${first.id}`)).toContainText("Discussion");
    await expect(follower.getByTestId(`live-agenda-item-${second.id}`)).toHaveAttribute("aria-current", "true");

    await sockets[0]!.close();
    await expect.poll(() => sockets.length).toBe(2);
    await conductor.getByTestId("live-agenda-complete").click();
    await expect(conductor.getByTestId(`live-agenda-item-${second.id}`)).toHaveAttribute("aria-current", "true");
    await expect(follower.getByTestId(`live-agenda-item-${first.id}`)).toContainText("Discussion");
    resumeReconnect?.();
    await expect(follower.getByTestId(`live-agenda-item-${first.id}`)).not.toContainText("Discussion");
    await expect(follower.getByTestId(`live-agenda-item-${second.id}`)).toHaveAttribute("aria-current", "true");
  } finally {
    resumeReconnect?.();
    await followerContext.close();
  }
});
