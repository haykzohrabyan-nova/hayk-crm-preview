// Shared types used by both new-quote-form and quote-detail

export type { QuoteSku } from "@/lib/utils/ticket-math";

export interface ProductType {
  id: string;
  name: string;
  material_groups: {
    group: { id: string; name: string };
    materials: { id: string; name: string }[];
  }[];
}

export type LookupOption = { value: string; label: string };

export type SkuLookups = {
  lamination: LookupOption[];
  color_mode: LookupOption[];
  sides: LookupOption[];
  roll_direction: LookupOption[];
  finishing: LookupOption[];
};
