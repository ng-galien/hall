import { useEffect, useMemo, useState } from "react";
import type { LiveMeetingAgendaItem } from "../../../models/liveMeeting";

// @implements-requirement HALL-FR-MTG-320
export function useConductAgendaSelection(
  agendaItems: LiveMeetingAgendaItem[],
  liveRevision: number,
  { conducts }: { conducts: boolean },
) {
  const orderedItems = useMemo(
    () => [...agendaItems].sort((left, right) => left.position - right.position),
    [agendaItems],
  );
  const activeItem = orderedItems.find((item) => item.status === "inProgress") ?? null;
  const nextItem = orderedItems.find((item) => item.status === "scheduled" || item.status === "inProgress") ?? null;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [openingSelected, setOpeningSelected] = useState(false);

  useEffect(() => {
    if (liveRevision === 0 || conducts) return;
    setSelectedItemId(null);
    setOpeningSelected(false);
  }, [conducts, liveRevision]);

  const selectedItem =
    orderedItems.find((item) => item.id === selectedItemId) ?? activeItem ?? nextItem ?? orderedItems.at(-1) ?? null;

  return {
    orderedItems,
    activeItem,
    nextItem,
    selectedItem,
    selectedItemId,
    setSelectedItemId,
    openingSelected,
    setOpeningSelected,
  };
}
