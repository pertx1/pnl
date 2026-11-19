import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Endpoint que Inngest llama para ejecutar las funciones (firmado con INNGEST_SIGNING_KEY en producción).
export const { GET, POST, PUT } = serve({ client: inngest, functions });

// La publicación de vídeo puede tardar: ampliar el tiempo máximo de la función en Vercel.
export const maxDuration = 300;
