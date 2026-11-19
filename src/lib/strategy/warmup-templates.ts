import type { Platform, WarmupIssue, WarmupTaskDraft } from "./schema";

/**
 * Plantillas de calentamiento por red (funcionan sin IA). Son acciones que hace el USUARIO A MANO en la app oficial.
 * Kreo no ejecuta ninguna de ellas: no hay likes, follows, comentarios ni publicaciones automáticas.
 */
type Locale = "es" | "en";
type Txt = { t: string; d: string };
type Dict = Record<string, Txt>;

const NAME: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

const ES: Dict = {
  profile: { t: "Completa el perfil", d: "Foto clara, nombre reconocible, bio con lo que ofreces en una frase y enlace solo si la red lo permite." },
  accountType: { t: "Elige el tipo de cuenta", d: "{platform}: cuenta de creador o empresa si vas a vender o colaborar con marcas (da acceso a estadísticas nativas)." },
  device: { t: "Usa tu dispositivo y conexión habituales", d: "Sin VPN ni proxies, y sin cambiar de móvil cada día. Una cuenta por dispositivo cuando sea posible." },
  guidelines: { t: "Lee las normas de la comunidad", d: "Las de {platform}, sobre todo contenido original, música con derechos y contenido de marca." },
  watch: { t: "Consume contenido del nicho como un usuario normal", d: "Unos 20 minutos viendo vídeos de {niche}. Deja que el algoritmo entienda de qué va tu cuenta." },
  follow: { t: "Sigue a mano cuentas relevantes del nicho", d: "Solo las que de verdad te interesen. Nada de seguir/dejar de seguir en masa." },
  comment: { t: "Deja comentarios genuinos a mano", d: "Comentarios que aporten (una pregunta, un dato, tu experiencia). Nada de copiar y pegar ni emojis sueltos." },
  references: { t: "Guarda referencias de formatos", d: "Guarda 10 vídeos de {niche} con buen gancho para inspirarte (no para copiarlos)." },
  prepare: { t: "Prepara tus primeras 3 piezas originales", d: "Graba tú el contenido. No resubas vídeos de otras cuentas ni el mismo vídeo en varias cuentas." },
  post: { t: "Publica 1 pieza original", d: "Hook en el primer segundo. Si usas IA, márcala con la etiqueta de la red. Publica desde Kreo (con aprobación) o desde la app." },
  postShort: { t: "Publica 1 Short original", d: "Vertical y menos de 60 s. Si usas IA, márcalo como contenido alterado o sintético." },
  postLong: { t: "Publica tu primer vídeo largo", d: "Título claro, miniatura propia y descripción útil. Nada de clickbait engañoso." },
  reply: { t: "Responde a mano a los comentarios", d: "Responde a todos los comentarios del día. Es la interacción que más ayuda." },
  noDuplicate: { t: "Nunca el mismo vídeo en varias cuentas", d: "Cada cuenta, su contenido. Si reutilizas una idea, cambia guion, edición y texto." },
  noBuy: { t: "No compres seguidores ni interacciones", d: "Ni likes, ni views, ni grupos de engagement. Las redes lo detectan y limitan el alcance." },
  stats: { t: "Revisa tus estadísticas nativas", d: "¿Qué pieza retuvo más? ¿De dónde vinieron las visitas? Apunta 2 aprendizajes." },
  rest: { t: "Día de descanso activo", d: "Hoy no publiques: interactúa un poco a mano y prepara ideas para los próximos días." },
  // Ajustes por problema
  zero_views_status: { t: "Comprueba el estado de la cuenta", d: "En la app: Configuración → Estado de la cuenta / avisos. Mira si algún vídeo está en revisión o restringido." },
  zero_views_original: { t: "Publica solo contenido 100 % original", d: "Sin marcas de agua de otras apps ni vídeos repetidos. No borres y vuelvas a subir el mismo vídeo." },
  zero_views_hook: { t: "Reescribe el gancho de tu próximo vídeo", d: "Los 2 primeros segundos deben decir de qué va. Prueba texto en pantalla." },
  low_reach_timing: { t: "Publica cuando tu público está activo", d: "Mira en estadísticas nativas a qué hora se conectan tus seguidores." },
  low_reach_audio: { t: "Usa audio permitido de la biblioteca oficial", d: "En cuentas de empresa, solo la biblioteca comercial. Nada de música con derechos sin licencia." },
  low_engagement_question: { t: "Termina con una pregunta concreta", d: "Una pregunta fácil de responder invita a comentar." },
  restricted_pause: { t: "Pausa 48 h y revisa el aviso", d: "Lee el motivo en la app. Si crees que es un error, apela por el canal oficial. No crees cuentas nuevas para evitarlo." },
  no_ideas_list: { t: "Lista 10 ideas a partir de tus pilares", d: "Usa la sección Estrategia de Kreo como punto de partida." },
  no_time_batch: { t: "Graba en bloque", d: "Reserva 1 h para grabar 3 piezas. Mejor menos frecuencia y constante que mucho y a ratos." },
};

const EN: Dict = {
  profile: { t: "Complete your profile", d: "Clear photo, recognisable name, one-line bio about what you offer, and a link only where the network allows it." },
  accountType: { t: "Choose the account type", d: "{platform}: creator or business account if you'll sell or work with brands (unlocks native analytics)." },
  device: { t: "Use your usual device and connection", d: "No VPN or proxies, and don't switch phones every day. One account per device when possible." },
  guidelines: { t: "Read the community guidelines", d: "{platform}'s rules, especially original content, copyrighted music and branded content." },
  watch: { t: "Watch niche content like a normal user", d: "About 20 minutes of {niche} videos. Let the algorithm learn what your account is about." },
  follow: { t: "Follow relevant niche accounts by hand", d: "Only those you genuinely like. No mass follow/unfollow." },
  comment: { t: "Leave genuine comments by hand", d: "Comments that add value (a question, a fact, your experience). No copy-paste or lone emojis." },
  references: { t: "Save format references", d: "Save 10 {niche} videos with strong hooks for inspiration (not to copy)." },
  prepare: { t: "Prepare your first 3 original pieces", d: "Film it yourself. Don't re-upload other accounts' videos or the same video on several accounts." },
  post: { t: "Post 1 original piece", d: "Hook in the first second. If you use AI, apply the network's AI label. Post from Kreo (with approval) or from the app." },
  postShort: { t: "Post 1 original Short", d: "Vertical and under 60 s. If you use AI, mark it as altered or synthetic content." },
  postLong: { t: "Post your first long video", d: "Clear title, your own thumbnail and a useful description. No misleading clickbait." },
  reply: { t: "Reply to comments by hand", d: "Reply to every comment today. It's the interaction that helps most." },
  noDuplicate: { t: "Never the same video on several accounts", d: "Each account gets its own content. If you reuse an idea, change script, edit and text." },
  noBuy: { t: "Don't buy followers or engagement", d: "No likes, views or engagement pods. Networks detect it and limit reach." },
  stats: { t: "Check your native analytics", d: "Which piece retained best? Where did views come from? Write down 2 learnings." },
  rest: { t: "Active rest day", d: "Don't post today: interact a little by hand and prepare ideas for the coming days." },
  zero_views_status: { t: "Check your account status", d: "In the app: Settings → Account status / notifications. See if any video is under review or restricted." },
  zero_views_original: { t: "Post only 100% original content", d: "No other apps' watermarks or repeated videos. Don't delete and re-upload the same video." },
  zero_views_hook: { t: "Rewrite the hook of your next video", d: "The first 2 seconds must say what it's about. Try on-screen text." },
  low_reach_timing: { t: "Post when your audience is active", d: "Check in native analytics when your followers are online." },
  low_reach_audio: { t: "Use allowed audio from the official library", d: "Business accounts: commercial library only. No unlicensed copyrighted music." },
  low_engagement_question: { t: "End with a specific question", d: "An easy-to-answer question invites comments." },
  restricted_pause: { t: "Pause 48 h and review the notice", d: "Read the reason in the app. If you think it's a mistake, appeal through the official channel. Don't create new accounts to get around it." },
  no_ideas_list: { t: "List 10 ideas from your pillars", d: "Use Kreo's Strategy section as a starting point." },
  no_time_batch: { t: "Batch your filming", d: "Block 1 h to film 3 pieces. Better lower but steady frequency than lots now and then." },
};

const DICTS: Record<Locale, Dict> = { es: ES, en: EN };

function txt(locale: Locale, key: string, vars: { platform: string; niche: string }) {
  const e = DICTS[locale][key];
  const fill = (s: string) => s.replace("{platform}", vars.platform).replace("{niche}", vars.niche);
  return { title: fill(e.t), detail: fill(e.d) };
}

/** Plan de calentamiento por red y duración (7–14 días). */
export function warmupTemplate(platform: Platform, durationDays: number, niche: string, locale: Locale): WarmupTaskDraft[] {
  const D = Math.min(14, Math.max(7, Math.round(durationDays)));
  const vars = { platform: NAME[platform], niche: niche.trim() || (locale === "es" ? "tu nicho" : "your niche") };
  const out: WarmupTaskDraft[] = [];
  const add = (day: number, category: WarmupTaskDraft["category"], key: string, targetCount: number | null = null) =>
    out.push({ day, category, ...txt(locale, key, vars), targetCount });

  // Días 1–3: preparar la cuenta y entender el nicho, sin publicar.
  add(1, "profile", "profile");
  add(1, "safety", "device");
  add(1, "learn", "guidelines");
  add(2, "profile", "accountType");
  add(2, "engage", "watch");
  add(2, "engage", "follow", 5);
  add(3, "engage", "watch");
  add(3, "engage", "comment", 3);
  add(3, "learn", "references", 10);
  add(4, "content", "prepare", 3);
  add(4, "engage", "comment", 3);
  add(4, "safety", "noDuplicate");

  // Días 5..D: publicar a ritmo sano + interacción manual.
  for (let day = 5; day <= D; day++) {
    const isLast = day === D;
    const comments = Math.min(10, 3 + Math.floor((day - 4) / 2));
    if (platform === "tiktok") {
      if (day % 4 === 0 && !isLast) add(day, "content", "rest");
      else add(day, "content", "post", 1);
    } else if (platform === "instagram") {
      if (day % 2 === 1 || isLast) add(day, "content", "post", 1);
      else add(day, "content", "rest");
    } else {
      if (isLast) add(day, "content", "postLong", 1);
      else if (day % 2 === 1) add(day, "content", "postShort", 1);
      else add(day, "content", "rest");
    }
    add(day, "engage", "comment", comments);
    if (day >= 6) add(day, "engage", "reply");
    if (day === 6) add(day, "safety", "noBuy");
    if (day === 8 || isLast) add(day, "learn", "stats");
  }
  return out;
}

const ISSUE_KEYS: Record<WarmupIssue, string[]> = {
  zero_views: ["zero_views_status", "zero_views_original", "zero_views_hook"],
  low_reach: ["low_reach_timing", "low_reach_audio"],
  low_engagement: ["low_engagement_question", "reply"],
  restricted: ["restricted_pause", "zero_views_status"],
  no_ideas: ["no_ideas_list"],
  no_time: ["no_time_batch"],
};
const ISSUE_CATEGORY: Record<string, WarmupTaskDraft["category"]> = {
  zero_views_status: "safety",
  zero_views_original: "content",
  zero_views_hook: "content",
  low_reach_timing: "learn",
  low_reach_audio: "content",
  low_engagement_question: "content",
  reply: "engage",
  restricted_pause: "safety",
  no_ideas_list: "content",
  no_time_batch: "content",
};

/**
 * Ajuste sin IA cuando el usuario marca un problema: añade tareas concretas a partir del día actual
 * (repartidas en los días que quedan). Las tareas ya existentes con el mismo título no se duplican.
 */
export function issueAdjustments(
  issues: WarmupIssue[],
  opts: { platform: Platform; niche: string; locale: Locale; fromDay: number; durationDays: number; existingTitles: string[] },
): WarmupTaskDraft[] {
  const vars = { platform: NAME[opts.platform], niche: opts.niche.trim() || (opts.locale === "es" ? "tu nicho" : "your niche") };
  const seen = new Set(opts.existingTitles.map((t) => t.trim().toLowerCase()));
  const from = Math.min(Math.max(1, opts.fromDay), opts.durationDays);
  const out: WarmupTaskDraft[] = [];
  let i = 0;
  for (const issue of issues) {
    for (const key of ISSUE_KEYS[issue] ?? []) {
      const { title, detail } = txt(opts.locale, key, vars);
      if (seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      const day = Math.min(opts.durationDays, from + Math.floor(i / 2));
      out.push({ day, category: ISSUE_CATEGORY[key] ?? "learn", title, detail, targetCount: null });
      i++;
    }
  }
  return out;
}
