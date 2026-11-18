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
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
