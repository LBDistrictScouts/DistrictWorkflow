export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <section className="section container guide"><h1>Sign in to District Workflow</h1><p>Use your district account to continue. Your account must belong to the workflow group for this environment.</p>{error && <p role="alert">Sign-in could not be completed. Check your workflow group access with your administrator and try again.</p>}<a className="button" href="/auth/login">Sign in with Cognito</a></section>;
}
