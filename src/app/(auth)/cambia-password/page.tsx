import { CambiaPasswordForm } from "./cambia-form";

export const metadata = {
  title: "Nuova password | Ordini",
};

export default async function CambiaPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const params = await searchParams;
  // Il link ricevuto via email contiene token + email: senza entrambi la
  // pagina mostra il messaggio "link non valido/scaduto".
  return (
    <CambiaPasswordForm token={params.token ?? ""} email={params.email ?? ""} />
  );
}
