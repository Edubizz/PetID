import { supabase } from "@/integrations/supabase/client";
import {
  normalizePublicPetPayload,
  type PublicPetPayload,
} from "@/lib/public-visibility";

/**
 * Single data path for the public QR profile.
 * Always uses get_public_pet (server-side visibility). Never query pets directly.
 */
export async function fetchPublicPetBySlug(slug: string): Promise<PublicPetPayload | null> {
  const { data, error } = await supabase.rpc("get_public_pet", { _slug: slug });
  if (error) throw error;
  // PostgREST RETURNS TABLE → JSON array (often one row).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return normalizePublicPetPayload(row as Record<string, unknown>);
}

/** React Query defaults for privacy-sensitive public profile reads. */
export const publicPetQueryOptions = {
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};
