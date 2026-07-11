import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLOR_OPTIONS, SEX_OPTIONS } from "@/lib/pet-constants";
import { useEffect, useState } from "react";

/**
 * Reusable dropdown/conditional fields for sex, color and microchip,
 * used by both the create and edit pet flows.
 */
export function PetSexField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm">Sexo</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {SEX_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PetColorField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  const knownColors = COLOR_OPTIONS.filter((c) => c !== "Outro");
  const isKnown = !!value && (knownColors as readonly string[]).includes(value);
  const [isOther, setIsOther] = useState<boolean>(!!value && !isKnown);

  // Keep "Outro" mode sticky across parent re-renders while the custom text is empty,
  // but reflect external changes (e.g. loading a pet with a known color).
  useEffect(() => {
    if (isKnown) setIsOther(false);
    else if (value && !isKnown) setIsOther(true);
  }, [value, isKnown]);

  const selected = isOther ? "Outro" : isKnown ? (value as string) : "";

  return (
    <div>
      <Label className="mb-1.5 block text-sm">Cor</Label>
      <Select
        value={selected}
        onValueChange={(v) => {
          if (v === "Outro") {
            setIsOther(true);
            onChange("");
          } else {
            setIsOther(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione a cor" />
        </SelectTrigger>
        <SelectContent>
          {knownColors.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
          <SelectItem value="Outro">Outro</SelectItem>
        </SelectContent>
      </Select>
      {isOther && (
        <Input
          className="mt-2"
          placeholder="Especifique a cor"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function PetMicrochipField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}) {
  // value semantics from DB / parent form:
  //   null / undefined -> unanswered
  //   ""               -> explicitly "no"
  //   any other string -> "yes" (the string is the chip number, possibly empty while typing)
  const [hasChip, setHasChip] = useState<"yes" | "no" | "">(() =>
    value === null || value === undefined ? "" : value === "" ? "no" : "yes",
  );

  // Sync when the parent loads a different pet.
  useEffect(() => {
    const next: "yes" | "no" | "" =
      value === null || value === undefined ? "" : value === "" ? "no" : "yes";
    setHasChip((prev) => {
      // Don't clobber "yes" while the user is typing an empty chip number.
      if (prev === "yes" && (value === null || value === undefined)) return prev;
      return next;
    });
  }, [value]);

  return (
    <div className="md:col-span-2">
      <Label className="mb-1.5 block text-sm">O pet possui microchip?</Label>
      <Select
        value={hasChip}
        onValueChange={(v) => {
          const next = v as "yes" | "no";
          setHasChip(next);
          if (next === "no") onChange("");
          else onChange(null); // "yes" but no number yet — parent treats null as "not saved"
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Sim</SelectItem>
          <SelectItem value="no">Não</SelectItem>
        </SelectContent>
      </Select>
      {hasChip === "yes" && (
        <Input
          className="mt-2"
          placeholder="Número do microchip"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}