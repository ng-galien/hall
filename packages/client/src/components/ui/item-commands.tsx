import { type ReactNode, useEffect, useRef, useState } from "react";
import { MoreIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";

/** One command of an opened item: an icon and a label written in clear in the « … » menu. */
export interface ItemCommand {
  id: string;
  label: string;
  icon: ReactNode;
  testId: string;
  onSelect(): void;
  disabled?: boolean;
  /** A switch that is on, such as a pinned item. */
  pressed?: boolean;
  destructive?: boolean;
}

/** Below this width of the line of the title, the frequent commands join the « … » menu. */
const compactWidth = 720;

/** True while the line of the title around `element` is too narrow for the frequent commands. */
function useNarrowLine(element: HTMLElement | null) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const line = element?.closest(".screen-title-row") ?? element?.parentElement;
    if (!line) return;
    const observer = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? 0) < compactWidth));
    observer.observe(line);
    return () => observer.disconnect();
  }, [element]);
  return narrow;
}

/**
 * The commands of an opened item, on the line of its title, in this order: the main command with its label, at most
 * two icons for the most frequent commands, the « … » menu that lists every other command in clear, then the cross
 * that closes the item. When the line is narrow, the icons join the menu before the title is cut. A command chosen in
 * the menu keeps the focus it gives, such as the field that renames the item.
 * @implements-requirement HALL-FR-LAY-100
 */
export function ItemCommands({
  primary,
  frequent = [],
  visible,
  menu = [],
  close,
}: {
  primary?: ReactNode;
  frequent?: ItemCommand[];
  /** Controls that keep their own place on the line, such as the automatic saving; they never join the menu. */
  visible?: ReactNode;
  menu?: ItemCommand[];
  close?: ReactNode;
}) {
  const { t } = useI18n();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const narrow = useNarrowLine(element);
  const shown = narrow ? [] : frequent.slice(0, 2);
  const listed = [...(narrow ? frequent : frequent.slice(2)), ...menu];
  const chosen = useRef(false);
  return (
    <div ref={setElement} className="item-commands" data-narrow={narrow ? "true" : undefined}>
      {primary}
      {shown.map((command) => (
        <Tooltip key={command.id}>
          <TooltipTrigger asChild>
            <Button
              variant="plain"
              size="icon"
              data-testid={command.testId}
              aria-label={command.label}
              aria-pressed={command.pressed}
              disabled={command.disabled}
              onClick={command.onSelect}
            >
              {command.icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{command.label}</TooltipContent>
        </Tooltip>
      ))}
      {visible}
      {listed.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="plain" size="icon" data-testid="item-commands-more" aria-label={t("item.more")}>
              <MoreIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="item-commands-menu"
            onCloseAutoFocus={(event) => {
              if (chosen.current) event.preventDefault();
              chosen.current = false;
            }}
          >
            {listed.map((command) => (
              <DropdownMenuItem
                key={command.id}
                data-testid={command.testId}
                data-pressed={command.pressed ? "true" : undefined}
                variant={command.destructive ? "destructive" : "default"}
                disabled={command.disabled}
                onSelect={() => {
                  chosen.current = true;
                  command.onSelect();
                }}
              >
                {command.icon}
                <span>{command.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {close}
    </div>
  );
}
