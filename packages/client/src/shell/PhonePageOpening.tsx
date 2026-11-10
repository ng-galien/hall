import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/** On a phone an opened item takes its own page: the opening becomes a navigation, and the opener is told it is done. */
// @implements-requirement HALL-FR-LAY-010
export function PhonePageOpening({ to, onClose }: { to: string; onClose(): void }) {
  const navigate = useNavigate();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    navigate(to);
    onClose();
  }, [navigate, onClose, to]);
  return null;
}
