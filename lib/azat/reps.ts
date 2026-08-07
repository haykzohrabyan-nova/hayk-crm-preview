// Client-safe rep pool (owner_id → name) for the azat CRM. Safe to import from
// client components — no service-role client or server-only imports here.

export type Rep = { id: string; name: string };

export const REPS: Rep[] = [
  { id: "b502082c-f831-452e-8170-af7c355d8f4c", name: "Gary" },
  { id: "98827086-1e28-456c-a727-f2488a71e4b4", name: "Maria" },
  { id: "51792983-3ee1-4d4c-955d-bc323c99d84c", name: "Ernesto" },
  { id: "44906a46-25e5-430d-8b07-efd33b3a3b61", name: "Manny Carlo" },
  { id: "6a818c50-59f4-465e-89fd-9a7c2246d8a5", name: "Azat" },
  { id: "96d18012-3303-4615-8ac9-cfbc846be348", name: "Hayk" },
];

export const REP_NAME = new Map(REPS.map((r) => [r.id, r.name]));

export function repName(id: string | null | undefined): string | null {
  if (!id) return null;
  return REP_NAME.get(id) ?? null;
}
