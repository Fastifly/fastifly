import { Link } from "@tanstack/react-router";
import { Button } from "@ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { cloneElement, isValidElement, type MouseEvent, type ReactElement, useState } from "react";
import { en } from "../i18n/en";

type BlockedActionSuggestion = {
  readonly label: string;
  readonly onClick?: () => void;
  readonly to?: string;
};

type BlockedActionGateProps = {
  readonly blocked: boolean;
  readonly children: ReactElement<Record<string, unknown>>;
  readonly reason: string;
  readonly suggestion?: BlockedActionSuggestion | undefined;
  readonly title?: string;
};

export function BlockedActionGate({
  blocked,
  children,
  reason,
  suggestion,
  title = en.actionGate.title,
}: BlockedActionGateProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isValidElement(children)) {
    return children;
  }

  const originalProps = children.props as {
    readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
    [key: string]: unknown;
  };
  const childOnClick = originalProps.onClick;

  const wrappedChild = cloneElement(children, {
    ...originalProps,
    disabled: false,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
        setDialogOpen(true);
        return;
      }

      childOnClick?.(event);
    },
  });

  return (
    <>
      {wrappedChild}
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{reason}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            {suggestion ? (
              suggestion.to ? (
                <Button asChild variant="outline">
                  <Link
                    onClick={() => {
                      setDialogOpen(false);
                    }}
                    to={suggestion.to}
                  >
                    {suggestion.label}
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setDialogOpen(false);
                    suggestion.onClick?.();
                  }}
                  type="button"
                  variant="outline"
                >
                  {suggestion.label}
                </Button>
              )
            ) : null}
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {en.actionGate.close}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
