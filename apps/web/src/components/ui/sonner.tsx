import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function resolveTheme(): "dark" | "light" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function Toaster(props: ToasterProps) {
  const [theme, setTheme] = useState<"dark" | "light">(() => resolveTheme());

  useEffect(() => {
    const updateTheme = () => setTheme(resolveTheme());
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", updateTheme);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", updateTheme);
    };
  }, []);

  return (
    <Sonner
      className="toaster group"
      icons={{
        error: <OctagonX className="size-4" />,
        info: <Info className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
        success: <CircleCheck className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
      }}
      richColors
      style={
        {
          "--border-radius": "var(--radius)",
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--popover-foreground)",
        } as CSSProperties
      }
      theme={theme}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
}
