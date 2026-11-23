import { describe, expect, it } from "vitest";
import { validateTarget } from "@/lib/posts/rules";
import { settledPostStatus } from "@/lib/posts/settle";
import {
  buildYouTubeVideoResource,
  CHUNK_UNIT,
  checkDirectFile,
  classifyUploadStatus,
  DEFAULT_CHUNK,
  nextChunk,
  offsetFromRange,
  planChunks,
  resolvePublishAt,
  statusQueryRange,
  youtubeErrorKey,
  youtubeInsertUrl,
} from "@/lib/social/youtube-upload-core";

const MB = 1024 * 1024;

describe("Subida directa a YouTube · troceado", () => {
  it("usa trozos de 16 MB, múltiplos de 256 KB", () => {
    expect(DEFAULT_CHUNK).toBe(16 * MB);
    expect(DEFAULT_CHUNK % CHUNK_UNIT).toBe(0);
  });

  it("trocea un archivo con Content-Range inclusivo y el último trozo más corto", () => {
    const size = 40 * MB + 123;
    const chunks = planChunks(size);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].contentRange).toBe(`bytes 0-${16 * MB - 1}/${size}`);
    expect(chunks[1].start).toBe(16 * MB);
    expect(chunks[2].end).toBe(size - 1);
    expect(chunks.reduce((n, c) => n + c.length, 0)).toBe(size);
  });

  it("un archivo pequeño va en un solo trozo", () => {
    expect(planChunks(1000)).toEqual([{ start: 0, end: 999, length: 1000, contentRange: "bytes 0-999/1000" }]);
  });

  it("reanuda desde un offset arbitrario (el que diga YouTube)", () => {
    expect(nextChunk(16 * MB + 5, 20 * MB).contentRange).toBe(`bytes ${16 * MB + 5}-${20 * MB - 1}/${20 * MB}`);
  });

  it("rechaza trozos que no son múltiplo de 256 KB y offsets fuera de rango", () => {
    expect(() => nextChunk(0, 10 * MB, 1000)).toThrow("chunk_not_multiple_of_256k");
    expect(() => nextChunk(10 * MB, 10 * MB)).toThrow("invalid_offset");
    expect(() => nextChunk(0, 0)).toThrow("invalid_size");
  });
});

describe("Subida directa a YouTube · Range y estados", () => {
  it("parsea la cabecera Range del 308", () => {
    expect(offsetFromRange("bytes=0-42")).toBe(43);
    expect(offsetFromRange("bytes=0-16777215")).toBe(16 * MB);
    expect(offsetFromRange(null)).toBe(0); // sin Range = nada recibido
    expect(() => offsetFromRange("bytes=5-10")).toThrow("invalid_range_header");
  });

  it("consulta de estado con bytes */tamaño", () => {
    expect(statusQueryRange(1234)).toBe("bytes */1234");
  });

  it("clasifica las respuestas", () => {
    expect(classifyUploadStatus(201)).toBe("done");
    expect(classifyUploadStatus(200)).toBe("done");
    expect(classifyUploadStatus(308)).toBe("incomplete");
    expect(classifyUploadStatus(404)).toBe("expired");
    expect(classifyUploadStatus(503)).toBe("retry");
    expect(classifyUploadStatus(0)).toBe("retry");
    expect(classifyUploadStatus(400)).toBe("fatal");
  });

  it("traduce errores de la Data API", () => {
    expect(youtubeErrorKey(403, { error: { errors: [{ reason: "quotaExceeded" }] } })).toBe("quota");
    expect(youtubeErrorKey(400, { error: { errors: [{ reason: "uploadLimitExceeded" }] } })).toBe("upload_limit");
    expect(youtubeErrorKey(400, { error: { errors: [{ reason: "invalidPublishAt" }] } })).toBe("invalid_publish_at");
    expect(youtubeErrorKey(401, null)).toBe("reconnect");
    expect(youtubeErrorKey(500, null)).toBe("generic");
  });

  it("valida el archivo elegido", () => {
    expect(checkDirectFile({ size: 2 * 1024 * MB, type: "video/mp4" })).toBe("ok");
    expect(checkDirectFile({ size: 10, type: "image/png" })).toBe("not_video");
    expect(checkDirectFile({ size: 0, type: "video/mp4" })).toBe("empty");
    expect(checkDirectFile({ size: 300 * 1024 * 1024 * MB, type: "video/mp4" })).toBe("too_big");
  });
});

describe("Subida directa a YouTube · metadatos", () => {
  const options = {
    yt_title: "Mi vídeo",
    yt_privacy: "public" as const,
    yt_tags: [" cafe ", "", "receta"],
    yt_category_id: "26" as const,
    yt_language: "es" as const,
    yt_made_for_kids: false,
    yt_embeddable: false,
    yt_license: "creativeCommon" as const,
    yt_notify_subscribers: false,
  };

  it("arma snippet y status igual que el worker, con la etiqueta de contenido sintético", () => {
    const r = buildYouTubeVideoResource({ options, caption: "Descripción", aiGenerated: true });
    expect(r).toEqual({
      snippet: { title: "Mi vídeo", description: "Descripción", tags: ["cafe", "receta"], categoryId: "26", defaultLanguage: "es", defaultAudioLanguage: "es" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true, embeddable: false, license: "creativeCommon" },
    });
  });

  it("con publishAt fuerza privacyStatus private (requisito de YouTube)", () => {
    const r = buildYouTubeVideoResource({ options, caption: "x", aiGenerated: false, publishAt: "2030-01-01T10:00:00.000Z" });
    expect(r.status).toMatchObject({ privacyStatus: "private", publishAt: "2030-01-01T10:00:00.000Z", containsSyntheticMedia: false });
  });

  it("valores por defecto prudentes: privado, categoría 22, sin etiquetas", () => {
    const r = buildYouTubeVideoResource({ options: {}, caption: "x", aiGenerated: false });
    expect(r.snippet).toEqual({ title: "", description: "x", categoryId: "22" });
    expect(r.status.privacyStatus).toBe("private");
    expect(r.status.embeddable).toBe(true);
  });

  it("notifySubscribers en la URL de inicio", () => {
    expect(youtubeInsertUrl(options)).toContain("uploadType=resumable&part=snippet,status&notifySubscribers=false");
    expect(youtubeInsertUrl({})).toContain("notifySubscribers=true");
  });

  it("publishAt solo si es público y futuro", () => {
    const now = Date.parse("2026-11-23T10:00:00Z");
    expect(resolvePublishAt("2026-11-24T10:00:00Z", "public", now)).toBe("2026-11-24T10:00:00.000Z");
    expect(resolvePublishAt("2026-11-24T10:00:00Z", "unlisted", now)).toBeNull();
    expect(resolvePublishAt("2026-11-24T10:00:00Z", undefined, now)).toBeNull();
    expect(resolvePublishAt("2026-11-23T09:00:00Z", "public", now)).toBeNull();
    expect(resolvePublishAt(null, "public", now)).toBeNull();
  });
});

describe("Subida directa a YouTube · reglas y estados", () => {
  it("la subida directa cumple youtube_video_required sin medios en la biblioteca", () => {
    const direct = { file_name: "largo.mp4", size_bytes: 3 * 1024 * MB, mime: "video/mp4" };
    expect(validateTarget("youtube", "texto", [], { yt_title: "T" })).toContain("youtube_video_required");
    expect(validateTarget("youtube", "texto", [], { yt_title: "T", yt_direct_upload: direct })).toEqual([]);
    // Instagram en la misma publicación sigue necesitando su propio medio.
    expect(validateTarget("instagram", "texto", [], {})).toContain("instagram_media_required");
  });

  it("estado final del post a partir de sus destinos", () => {
    expect(settledPostStatus(["published", "published"])).toBe("published");
    expect(settledPostStatus(["scheduled_on_platform"])).toBe("scheduled_on_platform");
    expect(settledPostStatus(["published", "scheduled_on_platform"])).toBe("scheduled_on_platform");
    expect(settledPostStatus(["published", "failed"])).toBe("failed");
    expect(settledPostStatus(["published", "scheduled"])).toBeNull(); // la subida directa aún no se hizo
    expect(settledPostStatus(["publishing"])).toBeNull();
    expect(settledPostStatus([])).toBeNull();
  });
});
