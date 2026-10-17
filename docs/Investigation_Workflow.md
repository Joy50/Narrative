# Investigation workflow

All text, URL, image, audio, and video submissions enter Rumor Scanner. Media originals are stored with SHA-256 and linked to their claim and case. Assignment selects an active user or AI Council. Analysts can attach additional evidence throughout the investigation.

The analysis sequence is verification with OpenAI public web search, forensic analysis for linked media, verification refreshed with the media findings, then narrative analysis with OpenAI. A forensic service may also return transcript and claims fields to supply extracted media content. Narrative results update the cluster and persist an internal alert when specific alarming reasons are returned. These alerts appear in Alert Analysis and the notification menu. Model suggestions never overwrite a claim verdict or approve a report.

Analysts use the investigation panel in Rumor Scanner, Claim Verification, Deepfake Analysis, or Narrative Analysis. Successful verification of a media claim routes to Deepfake Analysis; successful forensic analysis routes to Narrative Analysis. Submitting an analyst assessment also attempts narrative analysis, while preserving provider errors as records.

AI Council uses the same stages. A complete council investigation also generates a reviewable intelligence report draft. Missing configuration or a failed stage stops the pipeline and remains visible in run history. The council does not fabricate forensic findings. Completed results, citations, limitations, and provider names are stored for review.

## Configuration

Set OPENAI_API_KEY and OPENAI_MODEL in the ignored project-root .env file, or in the Django process environment. Django loads .env automatically; existing process environment variables take precedence. GPT-4.1 is the configured example model. Credentials stay on the backend. Restart Django after changing .env. Use manage.py check_openai to verify authentication and model access without generating content or printing credentials. The adapter uses https://api.openai.com/v1/responses with store=false. Verification makes a web research request and a structured assessment request; narrative analysis makes a structured request. Running stages incurs provider usage.

Set FORENSIC_SERVICE_URL and optionally FORENSIC_SERVICE_TOKEN for your service. Use HTTPS, or HTTP on localhost during development. The endpoint must return results synchronously. The adapter streams multipart/form-data containing a context JSON field and repeated files fields. The context.originals array gives each file's evidence ID, original filename, media type, size, and hash. Files are named <evidence_id>.bin in the multipart request. The adapter checks stored hashes before sending originals. An Authorization Bearer header is included when a service token is configured. Redirects are rejected.

Expected forensic response:

```json
{
  "summary": "Evidence-based media assessment",
  "findings": ["Observed finding"],
  "limitations": ["Known limitation"],
  "model": "Your detector and version"
}
```

The adapter does not interpret detector scores as probabilities. Map your service's native format to this contract when connecting it. Actual model accuracy and service availability require validation with your service.

## Operations

Run manage.py migrate before using the workflow. Start the backend on port 8000. Run history records completed, failed, and needs_configuration states. Interrupted running analysis records can be retried after fifteen minutes. The current implementation runs provider calls synchronously, with a ninety-second timeout per request. Allow sufficient HTTP request time at any deployment proxy; keep the browser page open while analysis runs.

Generate intelligence report draft creates a source and analysis snapshot. Repeated requests for unchanged investigation data open the existing generated report instead of overwriting an edited document. Changed evidence or new analysis creates a new draft while preserving earlier reports. Case progression and report approval remain separate human review workflows. Alerts are review leads, not accusations or automated public notifications.

## Endpoints

- GET /api/rumor/analysts/ lists active assignment candidates.
- GET /api/rumor/workflow/<claim_id>/ returns state, evidence, analysis history, alert, and generated report reference.
- POST /api/rumor/workflow/<claim_id>/assign/ accepts mode=analyst with user_id, or mode=council.
- POST /api/rumor/workflow/<claim_id>/run/ accepts stage=verification, forensic, narrative, or all.
- POST /api/rumor/workflow/<claim_id>/report/ creates or opens the generated report draft.
- POST /api/rumor/council/ runs the full council workflow for claim_id.
- POST /api/rumor/intake/ accepts text or URL intake, or multipart file and description for media.
- POST /api/rumor/evidence/ accepts multipart file, claim_id, and notes to add supporting evidence.

## Official API references

- OpenAI web search: https://developers.openai.com/api/docs/guides/tools-web-search
- OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs

The earlier user manual describes the previous local-rules council and demonstration forensic page. This workflow document supersedes those portions until the manual is revised.
