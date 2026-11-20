import AppPage from "@/app-home-page";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ id: string }>;
};

export default async function MixtapeShowPage({ params }: PageProps) {
    const { id } = await params;
    return <AppPage initialMixtapeId={id} />;
}