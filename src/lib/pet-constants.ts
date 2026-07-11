export const SEX_OPTIONS = [
  { value: "Macho", label: "Macho" },
  { value: "Fêmea", label: "Fêmea" },
] as const;

export const COLOR_OPTIONS = [
  "Preto",
  "Branco",
  "Marrom",
  "Caramelo",
  "Dourado",
  "Cinza",
  "Creme",
  "Tricolor",
  "Mesclado",
  "Outro",
] as const;

export const SPECIES_OPTIONS = [
  "Cachorro",
  "Gato",
  "Ave",
  "Roedor",
  "Réptil",
  "Outro",
] as const;

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3MB
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];