import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

// Cada módulo tiene su propio archivo de textos (messages/modules/<módulo>/<idioma>.json) para trabajar en paralelo.
const MODULES = ["research", "strategy", "inbox", "team", "commerce", "mcp", "clipper"] as const;

// Idioma sin prefijo en la URL: cookie (elegida por el usuario) → cabecera Accept-Language → español.
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  let locale: Locale = defaultLocale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const accept = (await headers()).get("accept-language") ?? "";
    const preferred = accept.split(",")[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(preferred)) locale = preferred;
  }
  const [app, landing, ...modules] = await Promise.all([
    import(`../../messages/${locale}.json`),
    import(`../../messages/landing/${locale}.json`),
    ...MODULES.map((m) => import(`../../messages/modules/${m}/${locale}.json`)),
  ]);
  return { locale, messages: Object.assign({}, app.default, landing.default, ...modules.map((m) => m.default)) };
});
