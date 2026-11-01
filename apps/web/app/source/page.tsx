import SourcePane from '../SourcePane';

export default async function Source({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <main>
        <p className="error">Missing room code — open /source?code=ROOMCODE</p>
      </main>
    );
  }

  return <SourcePane code={code.toUpperCase()} />;
}
