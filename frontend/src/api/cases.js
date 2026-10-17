import { request } from './client';

export async function casesGet(path) {
  return request(`/api/cases/${path}`);
}

export async function casesSend(path, { method = 'POST', body } = {}) {
  return request(`/api/cases/${path}`, { method, body });
}

export function mapCase(row) {
  return {
    pk: row.id,
    id: row.case_number,
    title: row.title,
    summary: row.summary || '',
    sub: row.summary_label || row.summary || '',
    state: row.state_label || row.state,
    stateKey: row.state,
    scls: row.state_class || 's-new',
    who: row.assignee_name || 'Unassigned',
    av: row.avatar_class || '',
    prio: row.priority,
    pcls: row.priority_class || 'prio-normal',
    when: row.updated_label || '',
    claimId: row.claim_id || '',
    notes: row.notes || '',
    evidenceCount: row.evidence_count || 0,
    events: row.events || [],
    actions: row.allowed_actions || [],
    created: !!row.created,
  };
}
