import { request } from './client';

export async function rumorGet(path) {
  return request(`/api/rumor/${path}`);
}

export async function rumorSend(path, { method = 'POST', body } = {}) {
  return request(`/api/rumor/${path}`, { method, body });
}

export function mapClaim(row) {
  const hit = row.validated_match || null;
  return {
    id: row.claim_id,
    pk: row.id,
    lang: row.language,
    source: row.source,
    firstSeen: row.first_seen_label || row.first_seen,
    matches: row.match_count,
    priority: row.priority,
    status: row.status,
    analyst: row.analyst,
    evidence: row.evidence,
    text: row.text,
    url: row.url,
    cluster: row.cluster,
    filter: row.filters || [],
    reviewScore: row.review_score || 0,
    notes: row.notes || '',
    intakeKind: row.intake_kind || '',
    validatedMatch: hit,
  };
}
