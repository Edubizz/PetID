import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { COLOR_OPTIONS, SEX_OPTIONS } from "@/lib/pet-constants";
import { BREED_SPECIAL, getBreedOptionsForSpecies, isKnownBreed } from "@/lib/pet-breeds";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

/**
 * Searchable breed combobox keyed by species.
 * Preserves free-text values that aren't in the curated list.
 */
export function PetBreedField({
  species,
  value,
  onChange,
}: {
  species: string | null | undefined;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  const options = useMemo(() => getBreedOptionsForSpecies(species), [species]);
  const known = isKnownBreed(species, value);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(() => Boolean(value) && !known);

  useEffect(() => {
    if (known) setCustomMode(false);
    else if (value && !known) setCustomMode(true);
  }, [value, known]);

  // When species changes, keep the stored breed (even if not in the new list).
  useEffect(() => {
    if (value && !isKnownBreed(species, value) && value !== BREED_SPECIAL.other) {
      setCustomMode(true);
    }
  }, [species]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayLabel = customMode
    ? value
      ? value
      : BREED_SPECIAL.other
    : value || "Selecionar raça";

  return (
    <div>
      <Label className="mb-1.5 block text-sm">Raça</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-11 w-full justify-between font-normal"
          >
            <span className={cn("truncate", !value && !customMode && "text-muted-foreground")}>
              {displayLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar raça…" />
            <CommandList>
              <CommandEmpty>Nenhuma raça encontrada.</CommandEmpty>
              <CommandGroup>
                {options.map((breed) => (
                  <CommandItem
                    key={breed}
                    value={breed}
                    onSelect={() => {
                      if (breed === BREED_SPECIAL.other) {
                        setCustomMode(true);
                        if (known || !value) onChange("");
                        setOpen(false);
                        return;
                      }
                      setCustomMode(false);
                      onChange(breed);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        (!customMode && value === breed) ||
                          (customMode && breed === BREED_SPECIAL.other)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {breed}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {customMode && (
        <Input
          className="mt-2"
          placeholder="Digite a raça"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
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