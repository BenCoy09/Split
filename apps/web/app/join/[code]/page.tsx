import JoinRedirect from './JoinRedirect';

export default async function Join({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ role?: string; token?: string }>;
}) {
  const { code } = await params;
  const { role, token } = await searchParams;
  return <JoinRedirect code={code.toUpperCase()} role={role} token={token} />;
}
