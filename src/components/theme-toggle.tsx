"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, systemTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  // Si lo elegido coincide con el sistema, volvemos a "seguir al sistema" (HIG: respetar la apariencia del sistema).
  const apply = () => setTheme(next === systemTheme ? "system" : next);
  return (
    <Button variant="outline" size="icon" onClick={apply} aria-label="Cambiar modo claro/oscuro">
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
