import type { Icon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { ScreenActions, useScreenScrolled } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { AddIcon, MoreIcon } from "../icons";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { ListRow, ListRowIcon, ListRows, type ResourceNature } from "./list-row";

/** One type the user may create at this place. */
export interface CreateOption {
  id: string;
  label: string;
  /** One short sentence under the label. */
  description?: string;
  Icon: Icon;
  nature: ResourceNature;
  /** Everyday gestures come first; the others wait behind « Autre » on a phone. */
  common?: boolean;
  testId?: string;
  onSelect(): void;
}

/**
 * The single creation control of Hall (choices 6B-2 and 6M-2). On a phone « + Nouveau » floats at the bottom right
 * and becomes « + » once the content scrolls; it opens a bottom sheet of list rows, everyday gestures first and the
 * rest behind « Autre ». On tablet and computer it sits in the screen header and opens a menu of the same rows.
 * `inline` keeps it in a section of the screen, with the same sheet and menu. With one type, it creates it directly.
 * @implements-requirement HALL-FR-LAY-120
 */
export function CreateButton({
  options,
  label,
  title,
  placement = "screen",
  testId = "create-button",
  optionsTestId = "create-options",
}: {
  options: CreateOption[];
  label?: string;
  /** Title of the sheet, such as « Nouveau dans Mon espace ». */
  title?: string;
  placement?: "screen" | "inline";
  testId?: string;
  optionsTestId?: string;
}) {
  const { t } = useI18n();
  const phone = usePhoneLayout();
  const scrolled = useScreenScrolled();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  if (options.length === 0) return null;
  const text = label ?? t("workspace.new");
  const single = options.length === 1 ? options[0] : null;
  const common = options.filter((option) => option.common);
  const others = options.filter((option) => !option.common);
  const ordered = [...common, ...others];
  const singleLabel = single ? `${text} · ${single.label}` : text;
  const reduced = phone && placement === "screen" && scrolled;

  const trigger = (props: Record<string, unknown>) => (
    <Button
      {...props}
      variant={placement === "inline" ? "secondary" : "primary"}
      className={phone && placement === "screen" ? "create-fab" : undefined}
      data-reduced={reduced ? "true" : undefined}
      data-testid={testId}
      aria-label={singleLabel}
      title={singleLabel}
    >
      <AddIcon />
      {reduced ? null : <span>{text}</span>}
    </Button>
  );

  const row = (option: CreateOption, close: () => void) => (
    <ListRow
      key={option.id}
      onOpen={() => {
        close();
        option.onSelect();
      }}
      openTestId={option.testId}
      head={
        <ListRowIcon nature={option.nature}>
          <option.Icon />
        </ListRowIcon>
      }
      title={option.label}
      detail={option.description}
    />
  );

  let control: ReactNode;
  if (single) {
    control = trigger({ onClick: single.onSelect });
  } else if (phone) {
    const close = () => {
      setSheetOpen(false);
      setShowOthers(false);
    };
    const visible = showOthers || common.length === 0 || others.length === 0 ? ordered : common;
    control = (
      <>
        {trigger({ onClick: () => setSheetOpen(true), "aria-expanded": sheetOpen })}
        <Dialog open={sheetOpen} onOpenChange={(open) => (open ? setSheetOpen(true) : close())}>
          <DialogContent
            className="app-sheet"
            placement="bottom"
            closeLabel={t("common.close")}
            aria-describedby={undefined}
            data-testid={optionsTestId}
          >
            <DialogTitle>{title ?? text}</DialogTitle>
            <ListRows>
              {visible.map((option) => row(option, close))}
              {visible === common ? (
                <ListRow
                  onOpen={() => setShowOthers(true)}
                  openTestId={`${testId}-other`}
                  head={
                    <ListRowIcon nature="folder">
                      <MoreIcon />
                    </ListRowIcon>
                  }
                  title={t("create.other")}
                  detail={others.map((option) => option.label).join(", ")}
                />
              ) : null}
            </ListRows>
          </DialogContent>
        </Dialog>
      </>
    );
  } else {
    control = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger({})}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="create-menu w-max" data-testid={optionsTestId}>
          {ordered.map((option) => (
            <DropdownMenuItem
              key={option.id}
              className="create-menu-row"
              data-testid={option.testId}
              onSelect={option.onSelect}
            >
              <ListRowIcon nature={option.nature}>
                <option.Icon />
              </ListRowIcon>
              <span className="create-menu-text">
                <span className="create-menu-label">{option.label}</span>
                {option.description ? <span className="create-menu-description">{option.description}</span> : null}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (placement === "inline") return control;
  return phone ? createPortal(control, document.body) : <ScreenActions>{control}</ScreenActions>;
}
