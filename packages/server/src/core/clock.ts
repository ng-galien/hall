/** The current time of the server; tests register their own clock. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
