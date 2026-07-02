// Suivi d'usage + coût + construction des digests hebdo / mensuels.
//
// Principe : chaque appel Anthropic est journalisé dans la table `usage_logs`
// (tokens + coût calculé au moment de l'écriture, donc historiquement exact même
// si les tarifs changent). Le digest agrège la période et formate un message.
// 100 % par-déploiement (chaque client a sa propre base Supabase + son DEPLOYMENT_NAME).

import { nomContact } from './notify';

// ====== Tarification Anthropic ($ par MILLION de tokens) ======
type Rate = { input: number; output: number; cacheWrite: number; cacheRead: number };
const PRICING: Record<string, Rate> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};
const FALLBACK_RATE: Rate = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function computeAnthropicCostUSD(model: string, u: AnthropicUsage): number {
  const r = PRICING[model] ?? FALLBACK_RATE;
  const cost =
    ((u.input_tokens || 0) * r.input +
      (u.output_tokens || 0) * r.output +
      (u.cache_creation_input_tokens || 0) * r.cacheWrite +
      (u.cache_read_input_tokens || 0) * r.cacheRead) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6; // 6 décimales
}

// ====== Accès Supabase via REST (service role) ======
const SUPA_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
const restHeaders = (extra: Record<string, string> = {}) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
};

// Journalise un appel Anthropic. Ne JAMAIS lever d'exception (le logging ne doit
// jamais casser la génération de rapport).
export async function logAnthropicUsage(model: string, usage: AnthropicUsage, chantierId?: string | null): Promise<void> {
  try {
    await fetch(`${SUPA_URL()}/rest/v1/usage_logs`, {
      method: 'POST',
      headers: restHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        service: 'anthropic',
        model,
        chantier_id: chantierId ?? null,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_tokens: usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
        cost_usd: computeAnthropicCostUSD(model, usage),
      }),
    });
  } catch (e) {
    console.error('[usage] Échec journalisation usage:', e);
  }
}

async function countRows(path: string): Promise<number> {
  try {
    const res = await fetch(`${SUPA_URL()}/rest/v1/${path}`, {
      headers: restHeaders({ Prefer: 'count=exact', Range: '0-0' }),
    });
    const cr = res.headers.get('content-range') || '';
    const total = cr.split('/')[1];
    return total && total !== '*' ? parseInt(total, 10) : 0;
  } catch {
    return 0;
  }
}

async function fetchRows<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(`${SUPA_URL()}/rest/v1/${path}`, { headers: restHeaders() });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

// Taux USD→EUR live (BCE via frankfurter.app), avec repli si indisponible.
async function getUsdToEur(): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const d = (await res.json()) as { rates?: { EUR?: number } };
      const rate = d?.rates?.EUR;
      if (typeof rate === 'number' && rate > 0) return rate;
    }
  } catch {
    /* repli */
  }
  return 0.92;
}

export type Period = 'week' | 'month';
interface UsageRow {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string;
}
interface TicketRow {
  categorie: string | null;
  statut: string | null;
}

// Construit le texte du digest (HTML léger pour Telegram). `now` injectable pour test.
export async function buildDigest(period: Period, now: Date = new Date()): Promise<string> {
  let start: Date;
  let end: Date;
  let label: string;

  if (period === 'week') {
    end = now;
    start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    label = `Semaine du ${fmtDate(start)} au ${fmtDate(end)}`;
  } else {
    const firstThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    end = firstThisMonth;
    label = `Mois de ${fmtMonth(start)}`;
  }

  const gte = `created_at=gte.${start.toISOString()}`;
  const lt = `created_at=lt.${end.toISOString()}`;

  const [visites, photos, vocaux, usageRows, ticketRows, backlogEnAttente] = await Promise.all([
    countRows(`chantiers?select=id&${gte}&${lt}`),
    countRows(`capture_items?select=id&type=eq.photo&${gte}&${lt}`),
    countRows(`capture_items?select=id&type=eq.vocal&${gte}&${lt}`),
    fetchRows<UsageRow>(`usage_logs?select=input_tokens,output_tokens,cost_usd&service=eq.anthropic&${gte}&${lt}`),
    // Support : demandes d'Hendrix sur la période (catégorie + statut).
    fetchRows<TicketRow>(`tickets?select=categorie,statut&${gte}&${lt}`),
    // Backlog encore ouvert (global, pas seulement la période) : ce qui reste à traiter.
    countRows(`tickets?select=id&backlog_statut=in.(nouveau,en_cours)`),
  ]);

  let inTok = 0;
  let outTok = 0;
  let costUsd = 0;
  for (const r of usageRows) {
    inTok += Number(r.input_tokens) || 0;
    outTok += Number(r.output_tokens) || 0;
    costUsd += Number(r.cost_usd) || 0;
  }
  const generations = usageRows.length;
  const eurRate = await getUsdToEur();
  const costEur = costUsd * eurRate;

  const name = process.env.DEPLOYMENT_NAME || 'Visite Technique';
  const titre = period === 'week' ? 'Rapport hebdomadaire' : 'Rapport mensuel';

  const lines = [
    `📊 <b>${escapeHtml(name)}</b>`,
    `${titre} — ${label}`,
    ``,
    `🏗️ <b>Activité</b>`,
    `• ${visites} visite${plural(visites)} créée${plural(visites)}`,
    `• ${generations} rapport${plural(generations)} généré${plural(generations)}`,
    `• ${fmtInt(photos)} photo${plural(photos)}, ${fmtInt(vocaux)} ${vocaux > 1 ? 'vocaux' : 'vocal'}`,
    ``,
    `🧠 <b>Consommation IA (Anthropic)</b>`,
    `• ${fmtInt(inTok + outTok)} tokens (entrée ${fmtInt(inTok)} / sortie ${fmtInt(outTok)})`,
    `• Coût : <b>$${costUsd.toFixed(2)}</b>  ≈  <b>${costEur.toFixed(2).replace('.', ',')} €</b>`,
  ];

  if (generations === 0) {
    lines.push(``, `<i>(Aucune génération facturée sur la période, ou suivi des coûts démarré récemment.)</i>`);
  }

  // ====== Section support (« Demander à Julien ») ======
  const nbDemandes = ticketRows.length;
  if (nbDemandes > 0 || backlogEnAttente > 0) {
    const par = (c: string) => ticketRows.filter((t) => (t.categorie ?? 'autre') === c).length;
    const bugs = par('probleme');
    const ameliorations = par('amelioration');
    const questions = par('question');
    const resolues = ticketRows.filter((t) => t.statut === 'resolu').length;
    const enAttente = nbDemandes - resolues;

    const ventilation = [
      bugs ? `${bugs} bug${plural(bugs)}` : '',
      ameliorations ? `${ameliorations} amélioration${plural(ameliorations)}` : '',
      questions ? `${questions} question${plural(questions)}` : '',
    ].filter(Boolean).join(', ');

    lines.push(``, `🎫 <b>Support (${nomContact()})</b>`);
    lines.push(`• ${nbDemandes} demande${plural(nbDemandes)}${ventilation ? ` (${ventilation})` : ''}`);
    if (nbDemandes > 0) {
      lines.push(`• ${resolues} résolue${plural(resolues)}, ${enAttente} en attente`);
    }
    if (backlogEnAttente > 0) {
      lines.push(`• 🗂️ Backlog : ${backlogEnAttente} item${plural(backlogEnAttente)} à traiter (bugs + idées)`);
    }
  }

  return lines.join('\n');
}

// ====== Formatage ======
function fmtDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
}
function fmtMonth(d: Date): string {
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
}
function fmtInt(n: number): string {
  return n.toLocaleString('fr-FR');
}
function plural(n: number): string {
  return n > 1 ? 's' : '';
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
