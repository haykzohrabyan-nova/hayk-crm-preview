import { CustomerProfile } from "@/components/customer-profile";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerProfile customerId={id} />;
}
