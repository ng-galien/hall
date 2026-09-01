import type * as React from "react";

import { SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { Input } from "./input";

type SearchInputProps = React.ComponentProps<typeof Input> & {
  status?: React.ReactNode;
};

function SearchInput({ className, status, ...props }: SearchInputProps) {
  return (
    <div className="relative min-w-0" data-slot="search-input">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input className={cn("pr-24 pl-7", !status && "pr-2.5", className)} type="text" {...props} />
      {status ? (
        <span
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground"
          role="status"
        >
          {status}
        </span>
      ) : null}
    </div>
  );
}

export { SearchInput };
