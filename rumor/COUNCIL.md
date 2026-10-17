# Council runs

Authenticated endpoints:

- `POST /api/rumor/council/` with `{"claim_id":"CL-..."}` executes and stores a run synchronously.
- `GET /api/rumor/council/?page=1&claim_id=CL-...` returns paginated history; the claim filter is optional.
- `GET /api/rumor/council/<id>/` retrieves a stored run.
- `POST /api/rumor/council/<id>/accept/` saves an Unverified assessment for analyst review, opens or reuses the claim's investigation case, and records the draft in its audit history. Repeating this request reuses the saved assessment.

Runs retain the claim snapshot, local corpus candidate, engine version, agent outputs, limitations, draft, timestamps, initiating user, and failure state. Draft acceptance does not approve a case or change its claim verdict.

The current `local-rules-v1` engine segments claims and searches the existing validated-claim corpus. It does not call an external language model, fetch source URLs, perform live OSINT, or analyze media. Candidate similarity is explicitly not treated as evidence of a verdict. Confidence is unset (stored as zero in the existing assessment schema). The UI makes these limits visible.

Database setup: `env\Scripts\python.exe manage.py migrate`.

Verification: `env\Scripts\python.exe manage.py test rumor.test_council --noinput`; from `frontend`, `npm test -- --watchAll=false --runInBand AICouncil.test.js` and `npm run build`.
