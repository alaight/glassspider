import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LegacyAdminSourceDetailRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/sources/${id}`);
}
