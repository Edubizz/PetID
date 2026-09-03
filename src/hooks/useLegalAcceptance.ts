import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  type LegalAcceptanceSource,
} from "@/lib/legal";
import { parseLegalAcceptance, type LegalAcceptanceSnapshot } from "@/lib/legal-gate";

export type LegalAcceptanceState = LegalAcceptanceSnapshot;

export function useLegalAcceptance(enabled = true) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["legal-acceptance"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_legal_acceptance");
      if (error) throw error;
      return parseLegalAcceptance(data);
    },
    staleTime: 30_000,
    retry: 1,
  });

  const accept = useMutation({
    mutationFn: async (source: LegalAcceptanceSource) => {
      const { data, error } = await supabase.rpc("accept_legal_documents", {
        _terms_version: TERMS_VERSION,
        _privacy_version: PRIVACY_VERSION,
        _source: source,
      });
      if (error) throw error;
      return parseLegalAcceptance(data);
    },
    onSuccess: (state) => {
      qc.setQueryData(["legal-acceptance"], state);
      void qc.invalidateQueries({ queryKey: ["legal-acceptance"] });
    },
  });

  return {
    ...query,
    acceptance: query.data ?? { accepted: false, current: false },
    needsAcceptance: query.isSuccess ? !query.data?.current : false,
    accept,
  };
}
