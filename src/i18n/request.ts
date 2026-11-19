import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

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
  // Mensajes de la app + mensajes de la landing (archivo aparte para trabajar en paralelo sin conflictos).
  const [app, landing] = await Promise.all([
    import(`../../messages/${locale}.json`),
    import(`../../messages/landing/${locale}.json`),
  ]);
  return { locale, messages: { ...app.default, ...landing.default } };
});
