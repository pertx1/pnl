import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-8">
      <p className="text-sm text-neutral-500">Fase 0 · Nombre e identidad visual</p>
      <h1 className="text-3xl font-bold">Aún no hay producto: estamos eligiendo marca.</h1>
      <Link href="/brand-preview" className="font-semibold underline">
        Ver las 3 direcciones visuales →
      </Link>
    </main>
  );
}
