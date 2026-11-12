import { NavLink } from "react-router-dom";
import { DraftIcon, SentIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { mailFolders } from "./mailFolders";

const folderIcons = { drafts: DraftIcon, sent: SentIcon };

/**
 * « Brouillons » and « Envoyés », indented under the Courriels entry of the menu while the Courriels screen is open.
 * @implements-requirement HALL-FR-EML-100
 */
export function MailFolderLinks() {
  const { t } = useI18n();
  return (
    <div className="nav-sub-entries" data-testid="mail-folders">
      {mailFolders.map((folder) => {
        const Glyph = folderIcons[folder];
        return (
          <NavLink
            key={folder}
            to={`/mail/${folder}`}
            className="nav-row nav-sub"
            data-testid={`mail-folder-${folder}`}
          >
            {({ isActive }) => (
              <>
                <span className="nav-icon">
                  <Glyph weight={isActive ? "bold" : "regular"} />
                </span>
                <span className="nav-label">{t(`mail.${folder}`)}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}
