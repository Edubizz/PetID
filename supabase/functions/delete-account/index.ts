/**
 * delete-account — Permanently delete the CURRENT authenticated user's account.
 *
 * Security:
 * - User is derived only from the Bearer JWT (never from a client-supplied user_id).
 * - SUPABASE_SERVICE_ROLE_KEY stays server-side.
 * - Pre-cleanup (tags, Stripe, storage, audit) runs BEFORE auth.admin.deleteUser.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { ACTIVE_SUB_STATUSES, createStripeClient } from "../_shared/stripe.ts";

const CONFIRM_PHRASE = "EXCLUIR";

async function deleteStorageFolder(
  admin: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const paths: string[] = [];

  async function walk(prefix: string): Promise<void> {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset: 0,
    });
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      // Missing bucket / empty folder is fine for MVP photo paths.
      if (
        msg.includes("not found") ||
        msg.includes("bucket") ||
        msg.includes("does not exist")
      ) {
        return;
      }
      throw error;
    }
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders typically have null id in Storage list API.
      if (!item.id) {
        await walk(path);
      } else {
        paths.push(path);
      }
    }
  }

  try {
    await walk(folder);
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) {
        return { ok: false, message: error.message };
      }
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Storage cleanup failed",
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    let confirm = "";
    try {
      const body = await req.json();
      if (body && typeof body.confirm === "string") {
        confirm = body.confirm.trim().toUpperCase();
      }
      // Intentionally ignore any body.user_id — never trusted.
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    if (confirm !== CONFIRM_PHRASE) {
      return jsonResponse(
        { error: "Confirmação inválida. Digite EXCLUIR para confirmar." },
        400,
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    // --- Sole-admin protection ---
    const { data: roleRow, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      console.error("delete-account: role lookup", roleError);
      return jsonResponse({ error: "Não foi possível verificar permissões." }, 500);
    }

    if (roleRow) {
      const { count, error: countError } = await admin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");

      if (countError) {
        console.error("delete-account: admin count", countError);
        return jsonResponse({ error: "Não foi possível verificar administradores." }, 500);
      }

      if ((count ?? 0) <= 1) {
        return jsonResponse(
          {
            error:
              "Você é o único administrador. Transfira o papel de admin para outra conta antes de excluir.",
            code: "sole_admin",
          },
          409,
        );
      }
    }

    // --- Stripe: cancel live subscription before deleting the account ---
    const { data: sub, error: subError } = await admin
      .from("billing_subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subError) {
      console.error("delete-account: subscription lookup", subError);
      return jsonResponse({ error: "Não foi possível verificar a assinatura." }, 500);
    }

    const subId = sub?.stripe_subscription_id?.trim() || null;
    const subStatus = (sub?.status ?? "").toLowerCase();
    const needsCancel = Boolean(subId && ACTIVE_SUB_STATUSES.has(subStatus));

    if (needsCancel && subId) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
      if (!stripeKey) {
        return jsonResponse(
          {
            error:
              "Há uma assinatura ativa, mas a cobrança (Stripe) ainda não está configurada neste ambiente. Resolva/cancele a assinatura com o suporte ou configure o Stripe antes de excluir a conta.",
            code: "stripe_not_configured",
          },
          409,
        );
      }

      try {
        const stripe = createStripeClient();
        await stripe.subscriptions.cancel(subId);
      } catch (err) {
        console.error("delete-account: stripe cancel failed", err);
        return jsonResponse(
          {
            error:
              "Não foi possível cancelar sua assinatura ativa. Cancele pelo portal de cobrança em Configurações e tente excluir a conta novamente.",
            code: "stripe_cancel_failed",
          },
          409,
        );
      }
    }
    // Essencial / no active Stripe subscription → skip Stripe entirely (no secret required).


    // --- Physical tags: detach / disable (do not delete inventory identity) ---
    const { data: ownedPets, error: petsError } = await admin
      .from("pets")
      .select("id")
      .eq("owner_id", userId);

    if (petsError) {
      console.error("delete-account: pets lookup", petsError);
      return jsonResponse({ error: "Não foi possível carregar os pets da conta." }, 500);
    }

    const petIds = (ownedPets ?? []).map((p) => p.id as string);
    const tagPatch = {
      status: "disabled",
      pet_id: null,
      activated_by: null,
      activated_at: null,
      updated_at: new Date().toISOString(),
    };

    const { error: tagByActivatorError } = await admin
      .from("physical_tags")
      .update(tagPatch)
      .eq("activated_by", userId);

    if (tagByActivatorError) {
      console.error("delete-account: detach tags by activator", tagByActivatorError);
      return jsonResponse(
        { error: "Não foi possível desvincular as tags físicas. Tente novamente." },
        500,
      );
    }

    if (petIds.length > 0) {
      const { error: tagByPetError } = await admin
        .from("physical_tags")
        .update(tagPatch)
        .in("pet_id", petIds);

      if (tagByPetError) {
        console.error("delete-account: detach tags by pet", tagByPetError);
        return jsonResponse(
          { error: "Não foi possível desvincular as tags físicas. Tente novamente." },
          500,
        );
      }
    }

    // --- Storage: remove objects under this user's folder in pet-photos ---
    const storageResult = await deleteStorageFolder(admin, "pet-photos", userId);
    if (!storageResult.ok) {
      console.error("delete-account: storage cleanup", storageResult.message);
      return jsonResponse(
        {
          error:
            "Não foi possível limpar arquivos da conta. Tente novamente em instantes.",
          code: "storage_cleanup_failed",
        },
        500,
      );
    }

    // --- Admin audit rows: FK is NOT NULL + ON DELETE SET NULL (would block auth delete) ---
    const { error: auditError } = await admin
      .from("admin_audit_log")
      .delete()
      .eq("admin_id", userId);

    if (auditError) {
      console.error("delete-account: audit cleanup", auditError);
      return jsonResponse(
        { error: "Não foi possível limpar registros administrativos. Tente novamente." },
        500,
      );
    }

    // --- Delete Auth user (cascades profiles, pets, billing, legal, roles, etc.) ---
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("delete-account: auth deleteUser", deleteError);
      return jsonResponse(
        {
          error:
            "Não foi possível excluir a conta. Contate o suporte se o problema continuar.",
          code: "auth_delete_failed",
        },
        500,
      );
    }

    return jsonResponse({
      ok: true,
      message: "Sua conta foi excluída.",
      retained: {
        // Intentional leftovers (no user PII / not owned pet content)
        billing_stripe_events:
          "Eventos de webhook Stripe (idempotência) sem vínculo de usuário — mantidos.",
        physical_tags:
          "Identidade física da tag permanece no inventário com status disabled, sem pet/dono.",
        stripe_customer:
          "Cliente Stripe pode permanecer no provedor; assinatura ativa foi cancelada quando existia.",
      },
    });
  } catch (err) {
    console.error("delete-account error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Exclusão falhou" },
      500,
    );
  }
});
