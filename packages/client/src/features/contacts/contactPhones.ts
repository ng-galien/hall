import type { Contact } from "@hall/api-contract";
import { useEffect, useState } from "react";

export const contactPhoneFields = ["mobilePhone", "personalPhone", "professionalPhone"] as const;
export type ContactPhoneField = (typeof contactPhoneFields)[number];
type ContactPhones = Pick<Contact, ContactPhoneField>;

/**
 * The single number a list row shows: the mobile, then the professional, then the personal number.
 * @implements-requirement HALL-FR-DIR-180
 */
export function preferredPhone(contact: ContactPhones): string | null {
  return contact.mobilePhone ?? contact.professionalPhone ?? contact.personalPhone;
}

export function phoneHref(stored: string): string {
  return `tel:${stored}`;
}

const touchQuery = "(pointer: coarse)";

/** True on a touch screen, where a telephone number opens a call. */
export function useTouchScreen(): boolean {
  const [touch, setTouch] = useState(() => window.matchMedia(touchQuery).matches);
  useEffect(() => {
    const query = window.matchMedia(touchQuery);
    const update = () => setTouch(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return touch;
}
