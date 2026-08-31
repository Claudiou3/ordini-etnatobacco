export type ApiKeyDef = {
  name: string;
  label: string;
  help: string;
  sensitive?: boolean;
  validate?: (value: string) => string | null;
};

/** Elenco delle chiavi che l'amministratore puo' configurare dalle Impostazioni. */
export const API_KEY_DEFS: ApiKeyDef[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    label: "Supabase — Project URL",
    help: "Indirizzo del database (es. https://xxxxxxxx.supabase.co)",
    validate: (value) =>
      value.startsWith("https://") ? null : "L'indirizzo deve iniziare con https://",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    label: "Supabase — chiave anon / publishable",
    help: "Consente login e registrazione degli agenti (nella dashboard Supabase è chiamata \"publishable\")",
    sensitive: true,
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase — service role / secret",
    help: "Usata solo lato server per importazioni e operazioni privilegiate (nella dashboard è chiamata \"secret key\")",
    sensitive: true,
  },
  {
    name: "RESEND_API_KEY",
    label: "Resend — API key (invio email)",
    help: "Per l'invio degli ordini all'email aziendale",
    sensitive: true,
  },
  {
    name: "ORDER_EMAIL_TO",
    label: "Email destinataria ordini",
    help: "Casella aziendale che riceve gli ordini",
  },
  {
    name: "EMAIL_FROM",
    label: "Email mittente ordini (dominio verificato)",
    help: "Mittente usato per l'invio degli ordini (deve essere un dominio verificato su Resend)",
  },
];
