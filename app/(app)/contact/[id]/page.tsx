import { Contact360 } from "@/components/contact/contact-360";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Contact360 id={id} />;
}
