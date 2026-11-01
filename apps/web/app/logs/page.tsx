import LogsPane from '../LogsPane';

export default async function Logs({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <main>
        <p className="error">Missing room code — open /logs?code=ROOMCODE</p>
      </main>
    );
  }

  return <LogsPane code={code.toUpperCase()} />;
}
