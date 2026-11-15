import { expect, type Page } from "@playwright/test";

type Bound = "start" | "end";

function monthIndex(day: string): number {
  return Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
}

/** Chooses a day of an appointment in the date picker of its field: the month is reached with the picker arrows. */
export async function chooseAppointmentDay(page: Page, bound: Bound, day: string) {
  const field = page.getByTestId(`event-${bound}-date`);
  const current = (await field.getAttribute("data-value")) ?? day;
  await field.click();
  const picker = page.getByTestId(`event-${bound}-date-picker`);
  await expect(picker).toBeVisible();
  const shift = monthIndex(day) - monthIndex(current);
  for (let step = 0; step < Math.abs(shift); step += 1)
    await page.getByTestId(`event-${bound}-date-picker-${shift > 0 ? "next" : "previous"}`).click();
  await page.getByTestId(`event-${bound}-date-picker-day-${day}`).click();
  await expect(picker).not.toBeVisible();
  await expect(field).toHaveAttribute("data-value", day);
}

/** Chooses an hour of an appointment in the quarter-hour list of its field. */
export async function chooseAppointmentTime(page: Page, bound: Bound, time: string) {
  await page.getByTestId(`event-${bound}-time`).click();
  await page.getByTestId(`event-${bound}-time-option-${time.replace(":", "-")}`).click();
  await expect(page.getByTestId(`event-${bound}-time-options`)).not.toBeVisible();
  await expect(page.getByTestId(`event-${bound}-time`)).toHaveAttribute("data-value", time);
}

/** Chooses `YYYY-MM-DD` (all day) or `YYYY-MM-DDTHH:MM` (timed) for a bound of an appointment. */
export async function chooseAppointmentBound(page: Page, bound: Bound, value: string) {
  const [day, time] = value.split("T");
  if ((await page.getByTestId(`event-${bound}-date`).getAttribute("data-value")) !== day)
    await chooseAppointmentDay(page, bound, day);
  if (time) await chooseAppointmentTime(page, bound, time);
}

/** The shown bound of an appointment: `YYYY-MM-DD` on an all-day appointment, `YYYY-MM-DDTHH:MM` otherwise. */
export async function expectAppointmentBound(page: Page, bound: Bound, value: string) {
  const [day, time] = value.split("T");
  await expect(page.getByTestId(`event-${bound}-date`)).toHaveAttribute("data-value", day);
  if (time) await expect(page.getByTestId(`event-${bound}-time`)).toHaveAttribute("data-value", time);
  else await expect(page.getByTestId(`event-${bound}-time`)).toHaveCount(0);
}
