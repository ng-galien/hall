import { SIREN_MEDIA_TYPE, type SirenEntity } from "@hall/api-contract";

export function committeeLinkCollection<T>(href: string, items: T[]): SirenEntity<{ items: T[] }> {
  return {
    class: ["council-business-committee-links"],
    properties: { items },
    links: [{ rel: ["self"], href, type: SIREN_MEDIA_TYPE }],
  };
}

export function committeeLinkResult<T extends { href: string }>(collectionHref: string, item: T): SirenEntity<T> {
  return {
    class: ["council-business-committee-link"],
    properties: item,
    links: [
      { rel: ["collection"], href: collectionHref, type: SIREN_MEDIA_TYPE },
      { rel: ["council-committee"], href: item.href, type: SIREN_MEDIA_TYPE },
    ],
  };
}
