import { findSirenLink, type SirenEntity } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { useMatch } from "react-router-dom";
import { apiSirenRequest } from "../services/apiClient";
import { USER_ACCESS_CHANGED_EVENT } from "../services/usersApi";

/** Above this width (an unfolded foldable, a tablet) the application keeps its drawer navigation. */
const phoneLayoutQuery = "(max-width: 760px)";

export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(phoneLayoutQuery).matches);
  useEffect(() => {
    const query = window.matchMedia(phoneLayoutQuery);
    const update = () => setPhone(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}

/** On a phone a document takes a whole page, except during the live conduct of a meeting, which keeps its screen. */
export function usePhoneDocumentPages(): boolean {
  const phone = usePhoneLayout();
  const liveConduct = useMatch("/meetings/:meetingId/live");
  return phone && !liveConduct;
}

/** The API root advertises the collections this user may reach. */
export function useApiRoot() {
  const [apiRoot, setApiRoot] = useState<SirenEntity | null>(null);
  useEffect(() => {
    let active = true;
    const refreshAccess = () => {
      void apiSirenRequest("")
        .then(({ representation }) => {
          if (active) setApiRoot(representation);
        })
        .catch(() => {
          if (active) setApiRoot(null);
        });
    };
    refreshAccess();
    window.addEventListener(USER_ACCESS_CHANGED_EVENT, refreshAccess);
    return () => {
      active = false;
      window.removeEventListener(USER_ACCESS_CHANGED_EVENT, refreshAccess);
    };
  }, []);
  return {
    available: (relation?: string) => !relation || Boolean(apiRoot && findSirenLink(apiRoot, relation)),
  };
}
