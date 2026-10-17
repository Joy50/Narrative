# AI Council

AI Council orchestrates the same investigation stages available to analysts: OpenAI claim verification and public web research, configured forensic service analysis of linked media, verification refreshed with media findings, narrative analysis, conditional internal alerts, and an intelligence report draft.

See [Investigation workflow](../docs/Investigation_Workflow.md) for setup, provider contracts, endpoints, and operational limitations. Set OPENAI_API_KEY and OPENAI_MODEL on the backend, and connect FORENSIC_SERVICE_URL before running media analysis. No scores or findings are fabricated when providers are missing.

POST /api/rumor/council/ with claim_id creates a stored run. GET /api/rumor/council/ provides paginated history, optionally filtered by claim_id. GET /api/rumor/council/<id>/ retrieves the stored snapshot. POST /api/rumor/council/<id>/accept/ saves a completed run's assessment for review and is idempotent.

Completed council runs generate draft reports and do not approve them or overwrite claim verdicts. Missing configuration and failures remain in history with the completed stages preserved. Each run stores analysis references, provider outputs, evidence limitations, and report references. Claim snapshots, report versions, case events, and evidence custody events remain separate records.

Apply migrations before use. Validate with manage.py test rumor.test_workflow rumor.test_council and the frontend WorkflowPanel and AICouncil tests.
