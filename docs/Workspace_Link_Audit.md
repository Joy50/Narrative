# Workspace link audit

Checked 17 October 2026. The audit covers navigation context and persistent data handoffs. Automated provider responses were used in integration tests; this does not validate a live forensic service.

| Workspace | Verified handoff or correction |
| --- | --- |
| Rumor Scanner | Deep-linked claims are searched directly instead of silently falling back to the first page. Media and Council actions preserve the effective selected claim. |
| Claim Verification | The generic route opens a claim picker instead of a demonstration claim. Failed lookups clear the old record. Back navigation preserves the claim, and evidence cards refresh after linked work. |
| Deepfake Analysis | The selected claim is retained from scanner, cases, repository, and verification. Media runs share the investigation record. |
| Narrative Analysis | Claim links resolve their actual cluster. Unclustered claims do not display an unrelated selected narrative. Results refresh after workflow actions. |
| Alert Analysis | Narrative links retain the originating claim. Alerts retain their links to verification and investigation cases. |
| Investigation Cases | Case-number links update selection. Forensic links retain the claim. Cases expose repository, Council, narrative, and shared investigation controls. Existing claim-linked cases are reused even without a canonical source key. |
| Evidence Repository | Exact evidence, claim, and case filters are supported. Evidence links return to its claim, case, and media workflow. A case-linked upload infers the claim and updates the evidence count. Conflicting case and claim references are rejected. |
| AI Council | Changing the claim filter clears the previous selected run. New runs update history context. Analysis, case, saved assessment, and generated report references remain available. |
| Intelligence Reports | Source snapshots link back to their case, claims, and original evidence. Stored analysis outputs and research citations are visible. |
| Submit Content | All intake types go to the scanner. Recent submissions come from the database and open the exact record. Nonfunctional example case choices and claims of automatic malware processing were removed. Existing-case evidence is added through that case or repository. |

## Remaining configuration and workflow boundaries

- The external forensic service URL and credentials are still required for real image, audio, and video analysis.
- A manual case without a linked claim cannot be sent directly through claim analysis; use claim intake to create a claim investigation. Its originals can still be recorded with the case reference.
- Case review, claim verdicts, and report approval remain distinct actions. Following links does not approve a result.
- Historical evidence without a claim association remains accessible by evidence ID or case reference; old records are not silently reassigned.
- Publishing a report is an internal state change and does not distribute it externally.
