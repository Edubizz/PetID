import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";
import {
  buildOwnerReminders,
  countUnreadReminders,
  dashboardReminders,
  type ReminderActionRow,
  type ReminderItem,
} from "@/lib/reminders";
import { logAndDescribeError } from "@/lib/errors";
import { toast } from "sonner";

export function useOwnerReminders() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["owner-reminders"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        return {
          prefs: parseNotificationPrefs({}),
          items: [] as ReminderItem[],
          actions: [] as ReminderActionRow[],
        };
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("notification_prefs")
        .eq("id", uid)
        .maybeSingle();

      const prefs = parseNotificationPrefs(
        (profile as { notification_prefs?: unknown } | null)?.notification_prefs,
      );

      const { data: pets, error: petsError } = await supabase
        .from("pets")
        .select("id, name, photo_url")
        .eq("owner_id", uid)
        .order("name");
      if (petsError) throw petsError;

      const petList = pets ?? [];
      const petIds = petList.map((p) => p.id);
      if (petIds.length === 0) {
        return { prefs, items: [] as ReminderItem[], actions: [] as ReminderActionRow[] };
      }

      const since = new Date();
      since.setDate(since.getDate() - 60);

      const [trackersRes, entriesRes, vaccinesRes, apptsRes, weightsRes, actionsRes] =
        await Promise.all([
          supabase
            .from("trackers")
            .select("id, pet_id, title, category, target_per_day, unit, is_active, reminder_times")
            .in("pet_id", petIds),
          supabase
            .from("tracker_entries")
            .select("tracker_id, pet_id, value, completed_at")
            .in("pet_id", petIds)
            .gte("completed_at", since.toISOString()),
          supabase
            .from("vaccines")
            .select("id, pet_id, name, next_dose")
            .in("pet_id", petIds),
          supabase
            .from("appointments")
            .select("id, pet_id, scheduled_at, reason")
            .in("pet_id", petIds),
          supabase
            .from("weight_history")
            .select("pet_id, measured_at")
            .in("pet_id", petIds)
            .order("measured_at", { ascending: false }),
          supabase
            .from("reminder_actions")
            .select("reminder_key, action")
            .eq("user_id", uid),
        ]);

      if (trackersRes.error) console.error("useOwnerReminders trackers", trackersRes.error);
      if (entriesRes.error) console.error("useOwnerReminders entries", entriesRes.error);
      if (vaccinesRes.error) console.error("useOwnerReminders vaccines", vaccinesRes.error);
      if (apptsRes.error) console.error("useOwnerReminders appts", apptsRes.error);
      if (weightsRes.error) console.error("useOwnerReminders weights", weightsRes.error);
      if (actionsRes.error) console.error("useOwnerReminders actions", actionsRes.error);

      const latestWeightByPet: Record<string, { measured_at: string } | null> = {};
      for (const id of petIds) latestWeightByPet[id] = null;
      for (const w of weightsRes.data ?? []) {
        if (!latestWeightByPet[w.pet_id]) {
          latestWeightByPet[w.pet_id] = { measured_at: w.measured_at };
        }
      }

      const actions = (actionsRes.data ?? []) as ReminderActionRow[];

      const items = buildOwnerReminders({
        pets: petList,
        trackers: (trackersRes.data ?? []) as Parameters<typeof buildOwnerReminders>[0]["trackers"],
        entries: (entriesRes.data ?? []) as Parameters<typeof buildOwnerReminders>[0]["entries"],
        vaccines: vaccinesRes.data ?? [],
        appointments: apptsRes.data ?? [],
        latestWeightByPet,
        prefs,
        actions,
      });

      return { prefs, items, actions };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const act = useMutation({
    mutationFn: async (payload: {
      petId: string;
      reminderKey: string;
      action: "dismissed" | "read" | "completed";
    }) => {
      const { error } = await supabase.rpc("upsert_reminder_action", {
        _pet_id: payload.petId,
        _reminder_key: payload.reminderKey,
        _action: payload.action,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-reminders"] });
    },
    onError: (e: Error) =>
      toast.error(
        logAndDescribeError("upsert_reminder_action", e, "Não foi possível atualizar o lembrete."),
      ),
  });

  const savePrefs = useMutation({
    mutationFn: async (prefs: NotificationPrefs) => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const { error } = await supabase
        .from("profiles")
        .update({ notification_prefs: prefs })
        .eq("id", uid);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-reminders"] });
      toast.success("Preferências de lembretes salvas");
    },
    onError: (e: Error) =>
      toast.error(
        logAndDescribeError("save_notification_prefs", e, "Não foi possível salvar."),
      ),
  });

  const items = query.data?.items ?? [];
  const unreadCount = useMemo(() => countUnreadReminders(items), [items]);
  const dashboardItems = useMemo(() => dashboardReminders(items), [items]);

  return {
    ...query,
    prefs: query.data?.prefs ?? parseNotificationPrefs({}),
    items,
    unreadCount,
    dashboardItems,
    dismiss: (item: ReminderItem) =>
      act.mutate({ petId: item.petId, reminderKey: item.key, action: "dismissed" }),
    markRead: (item: ReminderItem) =>
      act.mutate({ petId: item.petId, reminderKey: item.key, action: "read" }),
    markAllVisibleRead: () => {
      for (const item of items.filter((i) => i.unread)) {
        act.mutate({ petId: item.petId, reminderKey: item.key, action: "read" });
      }
    },
    savePrefs,
  };
}
