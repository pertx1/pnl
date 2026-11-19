import { cn } from "@/lib/utils";

/**
 * Cursor de terminal de Kreo: el mismo bloque que cierra el logo ("kreo_").
 * Es la seña de "Kreo está trabajando" en todos los estados de carga. Usa el color del texto
 * (se ve sobre el botón lima y sobre el fondo) y deja de parpadear con "reducir movimiento".
 */
export function TerminalCursor({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-block h-[0.2em] w-[0.75em] translate-y-[0.3em] bg-current motion-safe:animate-[kreo-blink_1.1s_steps(1)_infinite]",
        className,
      )}
    />
  );
}
