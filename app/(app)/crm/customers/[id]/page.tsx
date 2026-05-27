import { Suspense } from "react";
import { CustomerProfile } from "@/components/crm/customer-profile";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <CustomerProfile customerId={id} />
    </Suspense>
  );
}
