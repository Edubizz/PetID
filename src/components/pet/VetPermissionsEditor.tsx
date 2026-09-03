import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_VET_PERMISSIONS,
  VET_EDITABLE_AREAS,
  VET_PERMISSION_LABELS,
  VET_VIEW_ONLY_AREAS,
  type VetAccessLevel,
  type VetGrantPermissions,
  type VetPermissionArea,
} from "@/lib/vet-access";

type Props = {
  value: VetGrantPermissions;
  onChange: (next: VetGrantPermissions) => void;
  compact?: boolean;
};

function LevelSelect({
  area,
  value,
  allowEdit,
  onChange,
}: {
  area: VetPermissionArea;
  value: VetAccessLevel;
  allowEdit: boolean;
  onChange: (level: VetAccessLevel) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Label className="text-sm font-normal leading-snug">{VET_PERMISSION_LABELS[area]}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as VetAccessLevel)}>
        <SelectTrigger className="h-9 w-[140px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sem acesso</SelectItem>
          <SelectItem value="view">Visualizar</SelectItem>
          {allowEdit ? <SelectItem value="edit">Editar</SelectItem> : null}
        </SelectContent>
      </Select>
    </div>
  );
}

export function VetPermissionsEditor({ value, onChange }: Props) {
  const set = (area: VetPermissionArea, level: VetAccessLevel) => {
    onChange({ ...value, [area]: level });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-3 sm:p-4">
      <div>
        <p className="text-sm font-medium">Informações básicas</p>
        <p className="text-xs text-muted-foreground">Somente visualizar ou sem acesso.</p>
        <div className="mt-2 divide-y divide-border/60">
          {VET_VIEW_ONLY_AREAS.map((area) => (
            <LevelSelect
              key={area}
              area={area}
              value={value[area]}
              allowEdit={false}
              onChange={(level) => set(area, level)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">Saúde</p>
        <p className="text-xs text-muted-foreground">
          Editar só onde fizer sentido clinicamente. Nada começa em Editar.
        </p>
        <div className="mt-2 divide-y divide-border/60">
          {VET_EDITABLE_AREAS.map((area) => (
            <LevelSelect
              key={area}
              area={area}
              value={value[area]}
              allowEdit
              onChange={(level) => set(area, level)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function emptyVetPermissionsForm(): VetGrantPermissions {
  return { ...DEFAULT_VET_PERMISSIONS };
}
