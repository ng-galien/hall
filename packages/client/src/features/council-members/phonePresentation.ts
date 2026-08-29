const separators = /[\s().-]/g;

export function formatPhoneNumber(value: string): string {
  const compact = value.replace(separators, "");
  if (/^0[1-9]\d{8}$/.test(compact)) return compact.match(/.{1,2}/g)?.join(" ") ?? value;
  const international = compact.match(/^\+33([1-9])(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return international ? `+33 ${international.slice(1).join(" ")}` : value;
}

export function phoneHref(value: string): string {
  return `tel:${value.replace(separators, "")}`;
}
