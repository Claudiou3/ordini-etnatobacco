/**
 * Nomi dei cookie di sessione LOCALI (amministratore e sub-amministratore).
 *
 * Vivono in un modulo dedicato SENZA import Node (niente fs/crypto/path)
 * perché vengono letti anche dal Proxy/Middleware (runtime Edge, dove i
 * moduli Node non sono disponibili). La verifica vera e propria (firma
 * HMAC + scadenza) resta nelle pagine/server actions.
 */

export const ADMIN_SESSION_COOKIE = "ioi_admin_session";
export const SUBADMIN_SESSION_COOKIE = "ioi_subadmin_session";
