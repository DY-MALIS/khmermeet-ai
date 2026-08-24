export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="kh-card max-w-md p-6 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">No meeting found or this page does not exist.</p>
        <a className="kh-button-primary mt-5" href="/dashboard">Back to dashboard</a>
      </div>
    </main>
  );
}
