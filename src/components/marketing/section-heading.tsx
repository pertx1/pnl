import { cn } from "@/lib/utils";

/** Cabecera de sección de la landing: etiqueta mono + título + subtítulo opcional. */
export function SectionHeading({
  id,
  label,
  title,
  subtitle,
  className,
}: {
  id: string;
  label: string;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl space-y-3", className)}>
      <p className="label-mono">
        <span aria-hidden className="text-primary-ink">
          {"// "}
        </span>
        {label}
      </p>
      <h2 id={id} className="text-3xl font-bold text-balance sm:text-4xl">
        {title}
      </h2>
      {subtitle && <p className="text-base text-pretty text-muted-foreground sm:text-lg">{subtitle}</p>}
    </div>
  );
}

/** Contenedor estándar de ancho de la landing. */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}
