# NarrativeShield User Manual

User and administrator guide

Edition 1.0 | 17 October 2026 | Application baseline fde210a

NarrativeShield helps analysts collect public information, record claims, organize investigations, preserve original evidence, and prepare reviewed intelligence reports. This manual explains the current application from first login through reporting and routine administration.

Use this guide for the implementation in the Joy50/Narrative repository. Screen names follow the English interface. The Bangla switch changes supported interface text; it does not translate the underlying evidence or every screen. Procedures describe implemented behavior. Demonstration features and workflow gaps are identified explicitly.

The normal operational sequence is collection, claim triage, investigation, assessment, review, and reporting. An analyst remains responsible for evaluating the evidence and recording a defensible conclusion.

## Contents

1. Getting started
2. Navigation and daily orientation
3. Collecting news and submitting content
4. Working in Rumor Scanner
5. Managing investigation cases
6. Preserving original evidence
7. Running AI Council
8. Verifying claims
9. Reviewing narratives and alerts
10. Creating and reviewing intelligence reports
11. Understanding demonstrations and system settings
12. Completing a worked investigation
13. Troubleshooting
14. Administrator setup and maintenance
15. Reference and operational checklists

## 1 Getting started

### Who should use this guide

Analysts use the collection, scanner, evidence, council, and verification workspaces. Reviewers manage case review and report approval. Administrators provision accounts, initialize the application, maintain data, and manage the runtime. A displayed role or clearance label is not a complete permission specification; some modules require only an authenticated session.

### Before opening the application

Obtain the application URL, your username and password from the person running the installation. For the local development setup, the frontend normally runs at http://localhost:3000 and the API runs at http://127.0.0.1:8000. Both processes must be running. Internet access is required for news fetching, but existing local records can be reviewed without a live news connection.

### Sign in

1. Open the supplied application URL in a browser.
2. Enter Username and Password.
3. Select Establish secure session.
4. Confirm that Intelligence Overview opens and that the profile button shows the expected operator.

Both fields are required. An invalid login can result from incorrect account details or an inactive account. Ask your administrator to check the account rather than creating another identity.

The seeded local demonstration account shown on the login screen is a.rahman with password shield-0421. These values work only where the demonstration operators have been seeded and not subsequently changed. They are demonstration credentials, not an account provisioning process.

### Sign out

Open the profile button in the top right and select the logout control. Sign out before another operator uses the same browser. Session tokens are stored in the browser; use the application's logout action rather than relying on closing a tab.

### First session checklist

- Confirm your profile identity and choose EN or Bangla as needed.
- Open Rumor Scanner and check whether claims are available.
- If the installation is new, ask the administrator whether demonstration data was loaded.
- Open Investigation Cases and review assigned work.
- Treat examples and preloaded records as training material until their provenance is established.

## 2 Navigation and daily orientation

### Sidebar groups

Operations contains Intelligence Overview, Rumor Scanner, Claim Verification, Deepfake Analysis, Narrative Analysis, and Alert Analysis. Investigations contains Investigation Cases, Evidence Repository, AI Council, and Intelligence Reports. Media Ingest contains Global Media, Fetch News, Media Search, Media Insights, and Submit Content. System contains System Settings and Administration.

Expand or collapse groups using their arrow controls. Use the sidebar collapse control to make more room for the workspace. The page title and subtitle identify the current tool.

### Shared controls

The top search accepts claim text, URLs, or case terms and navigates to a search destination. Refine results using the destination page's own filters. EN and Bangla switch supported interface labels. The notification menu lists computed watch alerts and provides a route to Alert Analysis. The profile menu shows operator information and logout.

The top bar includes a range selector and a Healthy badge. Do not assume the range selector filters every module or that Healthy is a live infrastructure check. Use the local page filters, job status, error messages, and actual records to establish the state of your work. Likewise, the sidebar's air-gapped label does not establish that the deployment has no network access.

### Start a working day

1. Open Intelligence Overview for queue and activity orientation.
2. Open Investigation Cases and choose Assigned to me or Awaiting review.
3. Check Alert Analysis for claims that deserve attention.
4. Open the relevant case or claim before making updates.
5. Verify that any saved notes, verdict, or transition appears in the corresponding record.

### Understand records and identifiers

A claim has a claim ID and represents a statement under review. A case has a case number and organizes investigation work. An evidence object identifies an uploaded original and its hash. A council run has a run number and stores an analysis snapshot. A report has an ID, version, and review status. These records serve different purposes and are not interchangeable.

Dates in many frontend lists use the browser's local timezone. Some claim labels explicitly use UTC. Record the timezone when comparing timelines across screens.

## 3 Collecting news and submitting content

### Fetch public news

Use Fetch News to retrieve public headlines into the media corpus. This is separate from submitting a claim to the rumor workflow.

1. Open Fetch News.
2. Select saved keywords or add a keyword using the keyword field and Add.
3. Enter additional comma-separated terms where needed.
4. Choose the collection window and available source options.
5. Start the fetch using the page's primary action.
6. Watch the job status, log, and found and saved counts.
7. Open Global Media or Media Search to review stored results.

The backend supports Google News RSS keyword retrieval and active publisher RSS feeds. NewsNow is currently a watchlist log entry; it is not a completed NewsNow collector. Facebook page registration records a watch registry and does not collect private posts or provide a working Graph API connection.

Only one pending or running fetch job is allowed at a time. Jobs run in a background thread within the API process. Keep that process running until the job finishes. A zero saved count can mean no new items or no usable feed results; inspect the log before concluding that nothing happened.

### Browse and search the media corpus

Global Media provides the stored news view with the filters available on the page. Media Search searches ingested records rather than the whole web. Open an item to review its title, source, URL, date, and available text. Check the original source before using an item as evidence. Media Insights summarizes the stored corpus; counts reflect available ingestion, not total public activity.

The media subsystem and rumor subsystem have separate records. If a news item contains a claim that needs investigation, submit its claim text and source URL through Submit Content. Do not assume every fetched headline becomes an investigated claim automatically.

### Submit claim text or a URL

1. Open Submit Content and choose the appropriate intake type.
2. Enter the claim text or public source URL. Include descriptive text when submitting a URL so the statement to be checked is clear.
3. Fill in the source and any available context or notes.
4. Submit the intake.
5. Review the returned created or duplicate claim result in Rumor Scanner.

The current URL intake records the URL and supplied text. It does not guarantee that the linked page has been downloaded and its full content extracted. Claim segmentation, language handling, clustering, and duplicate detection use local rules and heuristics. Inspect their output.

### Submit media originals

Choose the media intake option, select the original files, and submit them. Successfully uploaded files appear in Evidence Repository. If a multi-file submission partly fails, keep the successful objects and retry only the remaining files. Record a separate textual claim if the media contains a statement to investigate. Uploading a file does not start genuine deepfake detection.

## 4 Working in Rumor Scanner

### Locate and select a claim

1. Open Rumor Scanner.
2. Search by a distinctive phrase, claim ID, source, URL, or cluster term.
3. Apply the language and status filters available on the page.
4. Move through result pages when necessary.
5. Select the claim and read its full text, source information, status, and evidence notes.

The priority indicates review urgency. It is separate from the verdict. A high priority claim can remain Unverified, and a low priority claim can still be false. Match counts and review scores are operational indicators, not calibrated probabilities or verified audience sizes.

### Local scanning and extraction

The scanner's source scan compares stored claims with the internal validated-claim corpus and refreshes related data. It does not crawl social networks. A match provides a pointer for an analyst to inspect and does not establish that two statements have the same meaning or truth value.

Bulk claim extraction reprocesses existing rumor records. It can create segmented claims or detect duplicates. Review its result before running it repeatedly. Refreshing narrative clusters recomputes groups from stored records; it does not discover every public discussion of the topic.

### Decide the next action

- Open Claim Verification when enough evidence is available to assess the statement.
- Open or create an Investigation Case when assignment, a review trail, or continued investigation is needed.
- Select Request AI Council review to send the selected claim ID to the council page.
- Upload supporting originals to Evidence Repository and use the case reference consistently.
- Keep the claim Unverified if the available material cannot support a conclusion.

### Maintain useful claim notes

Separate the exact statement being checked from what you observed. Record who published it, where it appeared, relevant dates, source URLs, and unresolved questions. For a time-sensitive claim, distinguish the publication date, the date shown in the content, and the alleged event date.

Do not replace missing evidence with a negative conclusion. A duplicate or a related corpus match may have different context, geography, or timing.

## 5 Managing investigation cases

### Create or open a case

Open Investigation Cases and use the new case control for a manual investigation. Enter a clear title, summary, priority, and the available assignment fields, then create the case. Claim-linked routes can open or reuse the investigation associated with a claim. Saving an AI Council draft also opens or reuses a claim-linked case.

Use All, Assigned to me, Critical, and Awaiting review to narrow the queue. Search by case number or relevant text. Select a row to view the case, notes, and history. The exported case list is a CSV queue extract, not a full evidence package.

### Assign and document work

Use Assign to me when available. Update the case notes and select Save notes. Check the saved record before leaving. A priority or evidence count is a tracking field; a displayed evidence count is not proof that the same number of uploaded, verified originals exists.

### Main review sequence

New cases can be triaged or moved into analysis. The normal sequence is NEW, TRIAGED, IN_ANALYSIS, ANALYST_REVIEW, SUPERVISOR_REVIEW, APPROVED, and PUBLISHED. The interface shows actions permitted by the current state.

1. Select Mark triaged after reviewing intake and ownership.
2. Select Start analysis when evidence review begins.
3. Save findings, limitations, and outstanding questions.
4. Select Submit analyst review when the investigation is ready.
5. Select Escalate to supervisor after analyst review.
6. Use Approve after the required review.
7. Select Publish finding only when the internal case status should become Published.

Publication here records an application state. It does not itself send a message, publish a public website, or post to an external platform.

### Return work and reopen cases

Use More evidence requested when the case cannot progress. The case can return to analysis or triage from NEEDS_MORE_EVIDENCE. Analyst review can return work to analysis; supervisor review can return work to analyst review. Approved or published cases can be reopened. Closed cases can also be reopened. Reopened cases can return to analysis or analyst review.

Some states offer Close; the application restricts transitions to those explicitly supported. An unavailable action may be a state restriction. Check the current state before retrying.

### Review history and boundaries

Case events record actions and relevant operator details. Council acceptance adds a draft event. Case transitions, claim assessment submissions, and report approvals are separate records. Moving a case to Approved does not automatically approve a report. Current case transition endpoints rely primarily on authentication and state rules; do not infer comprehensive role enforcement from the workflow labels.

## 6 Preserving original evidence

### Store an original

1. Open Evidence Repository and select Ingest evidence.
2. Choose a non-empty file up to 500 MB.
3. Enter an optional case reference, source URL, and notes.
4. Select Store original and wait for confirmation.
5. Select the stored object and verify its name, size, evidence ID, hash, and reference.

The backend stores the original file, calculates a SHA-256 hash, and records uploader and custody events. Use the exact case number in the reference field when linking material operationally. That field is text; it is not a guaranteed relational link to an investigation case.

### Search and inspect

Search by evidence ID, filename, case reference, or SHA-256. Select an object to see its metadata, notes, last integrity check, retention hold state, and custody history. Repository totals and hash issue counts help locate items needing attention.

### Verify integrity

Select Verify SHA-256 to compare the stored original with the recorded checksum. Review the returned integrity state and custody history. An integrity match means the bytes agree with the recorded hash. It does not establish that the content is authentic, accurate, or correctly attributed.

If the original is missing or the hash differs, record the issue and investigate the storage or provenance before using that copy. Preserve the recorded hash and history rather than editing the evidence to make it match.

### Download and retention holds

Download original retrieves the stored file through an authenticated API route and records a custody event. Save the copy in your approved investigation location and retain its identifier when citing it.

Place retention hold and Release retention hold toggle the stored hold flag and record an event. The current application does not provide a complete scheduled deletion or legal-retention enforcement system. Use the flag with your actual records-management process.

### Evidence handling checklist

- Keep the original file and record its source and collection context.
- Record event dates separately from upload dates.
- Use derivative copies for annotations or conversions.
- Verify hashes when transferring or relying on stored originals.
- Cite the exact evidence object and explain what it establishes.
- Keep private uploads in the backed-up storage location; they are excluded from Git.

## 7 Running AI Council

### Start an analysis

1. Select a claim in Rumor Scanner and choose Request AI Council review, or open AI Council directly.
2. Confirm or enter an existing claim ID.
3. Select Run new council.
4. Wait for the request to finish, then inspect the run number, status, claim text, timestamp, and outputs.

Each run is stored in the backend. The current engine is local-rules-v1 and executes synchronously. It retains a snapshot of the claim and any retrieved local corpus candidate, so later claim edits do not rewrite the completed run.

### Read the six outputs

Claim Agent segments the text and reports language. OSINT Agent performs a local validated-claim lookup and identifies any candidate. Forensic Agent states that media detection is unavailable. Context Agent reports recorded chronology and cluster context. Challenge Agent lists evidence limitations. Draft Composer prepares a conservative draft for human review.

These agent names describe processing stages. They do not mean six external AI models were called. There is no configured language-model provider, live source retrieval, URL validation, or media detector in this engine. A corpus candidate remains a candidate, and the intake timestamp is not evidence of the event date.

### Review history

Select Run history. Choose a stored entry to reopen its snapshot and outputs. Use Previous and Next for additional pages. When the council page was opened with a claim filter from the scanner, its history is scoped to that claim. Open the general AI Council route to browse all runs.

### Save and review the draft

1. Read Challenge and consistency review and Draft assessment.
2. For a completed run, select Save draft to case file.
3. Confirm Draft saved for review.
4. Select Review saved draft to open the saved assessment in Claim Verification.
5. Select Open case file to inspect the linked investigation and draft event.

Saving creates an Unverified assessment at analyst review stage with confidence stored as zero to represent an unset value. It also opens or reuses the claim's case and records the draft in case history. Repeated acceptance of the same run reuses its assessment. This action does not change the claim verdict, advance the case, or approve a report.

### Failed runs

A failed run retains a failure state and generic error. It cannot be accepted as a draft. Confirm the claim exists and the API is available, then start a new run. Ask the administrator to inspect server logs if failures continue.

## 8 Verifying claims

### Open the intended record

Enter Claim Verification through the selected claim or Review saved draft. Confirm the claim ID and text at the top before editing. Opening the generic verification route may load a default demonstration claim; do not assume it is your last selected investigation.

### Inspect the evidence

Review source entries, any internal validated match, and original files. Follow the recorded source trail and compare the exact statement, location, date, and context. Some evidence cards are generated from local rules or seeded examples; their presence does not establish that a source was fetched or independently checked.

### Record the conclusion

1. Choose the verdict supported by your investigation.
2. Set analyst confidence with the confidence control.
3. Enter the reasoning, evidence references, and important limitations.
4. Select Submit for review.
5. Confirm that the scanner reflects the stored status and analyst attribution.

Available verdicts are Supported, Refuted, Misleading, Out of Context, Synthetic Media, Unverified, and Satire or Parody. Use Unverified when the material does not justify a stronger conclusion. Use Synthetic Media only when actual evidence supports that assessment, not because the demonstration forensic screen shows a score.

Confidence is an analyst-entered number from 0 to 100. It is not a calibrated model probability. Council drafts start at zero because the current assessment schema has no separate unset confidence field. Set a deliberate value before submitting if the investigation supports one.

### Understand what submission changes

Submitting immediately updates the claim's status, analyst attribution, and evidence notes, and creates an assessment with supervisor stage. A Supported submission also creates or updates an active entry in the internal validated-claim corpus. This occurs before a separate case or report approval action.

The wording Submit for review does not mean the claim's visible verdict is held back until supervisor approval. Review important verdict changes under your team's actual operating procedure. A council draft's saved notes remain available through its exact assessment link, but submitting from verification creates a new assessment rather than editing that old council snapshot.

### Practical verdict guidance

Supported requires relevant corroborating evidence. Refuted requires evidence contradicting the statement. Misleading applies when presentation materially distorts the supported facts. Out of Context applies when genuine material is used with the wrong context. Satire or Parody requires context supporting that interpretation. Explain the reason in notes; the label alone is insufficient.

## 9 Reviewing narratives and alerts

### Narrative Analysis

Use this workspace to inspect stored narrative clusters and their related claims. Select a cluster, review its records and chronology, and open the relevant investigation or claim. Clusters depend on local classification rules and the available corpus. Similar wording or a shared cluster does not establish coordinated activity.

Compare source dates, geography, repeated phrases, and the actual underlying records before treating apparent repetition as a pattern. A displayed trend describes the application's recorded data, not the full population of online posts.

### Alert Analysis

Open an alert from the top notification menu or Alert Analysis. Read the reason, contributing claims, and available evidence or data gaps. Assign the alert where the page provides an assignment control, and follow through using the claim or case workflow.

Alerts are computed from local rumor records and rules. They are prioritization leads. A high score does not establish malicious intent, organized coordination, a deepfake, or a false claim. Assignment records responsibility; it is not a final assessment.

### Media Insights

Use Media Insights to compare stored article volumes, country summaries, categories, or sentiment views available in the interface. Adjust the page's filters before making comparisons. Ingestion differences can explain apparent country or time differences. Sentiment and summaries use local processing and need review for language and context errors.

### Record an analytical observation

State the observed pattern, identify the contributing records, specify the timeframe, and explain alternative interpretations. Record what additional evidence would change your conclusion. Open a case when the observation needs ownership and continued investigation.

## 10 Creating and reviewing intelligence reports

### Create a draft

1. Open Intelligence Reports and start a new report.
2. Enter the title, language, and case reference.
3. Search and select at least one claim. Use claim result pages if necessary.
4. Select relevant evidence objects when available.
5. Enter or review Summary, Findings, and Recommendations.
6. Save the report and confirm its ID, status, and version.

The report captures a source snapshot at creation. This supports a stable record of what the report relied on. Later claim or evidence metadata changes do not automatically refresh that snapshot. If the source basis changes materially, document it through an appropriate revised or replacement report rather than assuming a refresh occurred.

The language field supports English and Bangla. It labels the report language; it is not a guaranteed automatic translation service. Review all narrative text in the chosen language.

### Edit and prevent conflicts

Only draft reports can be edited, and editing is limited to the author or a permitted reviewer. Save changes before changing status. Reports use version checks; if another user has saved a newer version, reload the current report and reconcile your edits before trying again. Keep unsaved text separately before reloading if needed.

### Submit and review

The report sequence is Draft, Pending review, Approved, and Published. Submit sends a draft to review. Approval moves a pending report to Approved. Publish moves an approved report to Published. A reviewer can request revision from Pending review, Approved, or Published; a review note is required, and the report returns to Draft.

Reviewer permission is based on Django staff status or the rumor.review_intelligencereport permission. A profile that merely displays Supervisor is not the complete permission check. The current report workflow does not require the author and reviewer to be different people if the author has reviewer permission.

### Inspect versions and history

Use the history control to inspect revisions and audit events. Preview a selected revision to see its recorded contents. Confirm whether you are viewing the current editable report or a historical snapshot before making decisions. Source snapshots, report versions, and case events have different purposes.

### Export and publication meaning

Use the export options presented on the report page. The current intelligence report backend provides plain text and JSON downloads. The separate media subsystem has a Word export endpoint; it is not the intelligence report exporter. Open the downloaded file and confirm the report ID, version, status, source references, and content before distributing it.

Published is an internal report state. This application does not automatically email a report, post it to social media, or publish a public web page. Apply your actual distribution process after the required review.

## 11 Understanding demonstrations and system settings

### Deepfake Analysis is a demonstration

The current page contains predefined frames, waveforms, detector rows, metadata, and example annotations. Selecting a file updates the displayed filename; Run analysis and Export findings show notifications. They do not invoke a working detector or produce a verified forensic export. The annotation action does not persist a complete forensic case record.

Use the page to demonstrate the intended interface only. For operational analysis, preserve originals in Evidence Repository and record findings from an actual validated examination process in claim or case notes. Never cite a displayed demonstration detector score as a result from the uploaded file.

### Administration is a demonstration

Operators, Connectors, Audit log, and Models on the Administration page use predefined example rows. Invite operator shows a notification and does not provision a real account. Listed model versions and connector health states are not an inventory of functioning external services. The example audit list is not the authoritative system audit trail.

Actual account administration uses Django's account and profile facilities. Actual operational histories are stored on cases, evidence objects, council runs, and reports where implemented.

### System Settings stores media registries

System Settings provides persistent country, publisher, and Facebook page registry controls. Add a country using the country picker and a recognized country code. Add a publisher with its name, site or feed-related URL fields, and country. Add a page registry entry with its name, page identifier, category, and country. Review the list after saving.

Check publisher records before starting a fetch. A registered source is configuration, not proof that its feed is reachable. A Facebook registry entry does not provide private content access or a working API integration. Seeded source labels are examples unless your installation has validated their configuration.

### Capability summary

- Persistent operations: login, claim intake, assessments, investigation cases, original evidence storage, council history, reports, and media registries.
- Network-dependent operations: implemented public RSS retrieval and opening original external sources.
- Local heuristic operations: claim segmentation, candidate matching, cluster and alert calculations, and parts of media text analysis.
- Demonstrations: Deepfake Analysis and Administration page content and their notification-only actions.
- Separate manual processes: external distribution, comprehensive role governance, operational retention policy, and genuine forensic examination.

## 12 Completing a worked investigation

### Example scenario

A public post claims that a video shows an election rally held yesterday. This is a training scenario and does not assert anything about an actual event. The task is to determine whether the date and context are supported.

### Intake and preservation

1. Submit the exact statement through Submit Content, including the public post URL and the alleged event date.
2. Record the resulting claim ID from Rumor Scanner.
3. Open a claim-linked investigation case and assign responsibility.
4. Upload the original available video to Evidence Repository, using the case number as its reference.
5. Record collection details and inspect the stored hash and custody event.

### Analysis and assessment

6. Run AI Council with that claim ID. Review any local corpus candidate as a lead only.
7. Save its completed draft, then open the saved assessment in Claim Verification.
8. Independently establish the video's earliest available publication and event context. Record the source trail and unresolved gaps.
9. Choose Out of Context only if evidence establishes that genuine footage is being presented with the wrong date or setting. Otherwise retain Unverified or another justified verdict.
10. Set analyst confidence deliberately and submit the reasoning. Remember that this changes the claim's visible status immediately.

### Review and reporting

11. Update case notes and advance the case through analyst and supervisor review, or request more evidence.
12. Create an Intelligence Report using the claim and relevant evidence objects. Review the report's source snapshot and draft text.
13. Submit the report for review. A permitted reviewer approves or requests revision.
14. After approval, record publication if appropriate and export the intended version for your distribution process.
15. Confirm the claim verdict, case state, and report state separately. They do not move together automatically.

### Expected records

The investigation should leave a claim, an investigation case with history, an evidence object with a recorded hash, a stored council run and saved assessment, an analyst assessment if submitted, and a report with versions and events if created. A simple intake does not automatically create all of these records.

## 13 Troubleshooting

### Login fails or API unreachable

Confirm the backend is running on the port expected by the frontend proxy, normally 8000. Confirm the frontend is running, then check the username and password. The current development proxy points to port 8000. Ask the administrator to confirm the account is active and the database has been migrated.

### Empty queues after a fresh clone

The local database is excluded from Git. A fresh checkout has no working database or uploaded originals. Run migrations and provision accounts. Load demonstration data only if a training dataset is wanted. Clear filters and check the selected page before concluding that data is missing.

### News fetch returns no results

Check keyword spelling, active publisher configuration, internet access, feed availability, and the job log. Public RSS feeds may provide only recent headlines. The chosen date window does not guarantee access to a historical archive. Saved counts can be lower than found counts because of duplicates or rejected items.

### Another fetch job is running

Wait for the existing pending or running job to finish. If the API process was interrupted, have the administrator inspect the job and logs. The backend can mark running jobs older than twenty minutes as stale when checking for active work; a pending job may require separate investigation. Do not repeatedly start new jobs.

### Council cannot find a claim or a run fails

Copy the exact claim ID from Rumor Scanner, not the case number or an evidence ID. Retry after restoring API connectivity. Inspect the recorded failure state. Failed runs cannot be saved as drafts; start a new run after the underlying issue is resolved.

### Upload or original download fails

Use a non-empty file no larger than 500 MB. Check disk space, private upload directory permissions, session authentication, and reverse-proxy limits if one is deployed. If a download or integrity check reports a missing original, restore the corresponding file from a verified backup and preserve the audit trail.

### Action disabled or permission denied

Check the record's current state. A failed council run cannot be accepted, an already saved council draft cannot be accepted again through the button, and reviewed reports must return to Draft before editing. Report approval and publication require reviewer permission. A displayed role label alone may not grant it.

### Report changed or a save was rejected

Copy unsaved text somewhere safe, reload the current report, compare versions, and reapply only the intended changes. Do not overwrite a colleague's work blindly. If the error is a required field, select at least one claim and complete the required report inputs.

### A notification appears but no record changes

Check whether the action is on a demonstration screen. Deepfake Analysis and Administration contain notification-only actions. For persistent work, reopen the relevant case, claim, evidence object, council run, or report and confirm the saved state.

## 14 Administrator setup and maintenance

### Install a fresh checkout

Use a Python version compatible with the pinned Django requirements and a Node version compatible with the frontend. The repository's original local environment used Python 3.12, but check package compatibility when rebuilding because the requirements pin framework versions. The virtual environment, node_modules, database, private uploads, and compiled frontend build are excluded from Git.

From the project root in PowerShell, create a virtual environment and install the backend requirements:

```powershell
python -m venv env
.\env\Scripts\python.exe -m pip install -r requirements.txt
.\env\Scripts\python.exe manage.py migrate
```

Provision a real administrator using createsuperuser, or initialize demonstration operators for local training:

```powershell
.\env\Scripts\python.exe manage.py createsuperuser
.\env\Scripts\python.exe manage.py seed_operators
```

Run seed_operators only when intended: it creates or updates demonstration users and resets their seeded passphrases. Optional training data commands are seed_gpob, seed_rumor, and seed_cases. Review each command's help and intended dataset before running it on an existing installation.

### Start the development application

Start the API in one PowerShell terminal from the project root:

```powershell
.\env\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

In another terminal, install frontend packages and start the development frontend:

```powershell
cd frontend
npm ci
npm start
```

Open http://localhost:3000. The frontend's setupProxy.js directs /api requests to http://127.0.0.1:8000. If an alternative API is used, align the proxy or REACT_APP_API_URL, allowed hosts, and CORS settings. Restart the frontend after changing build-time environment configuration.

### Account administration and review access

Use Django account management for real users and associated OperatorProfile records. A profile carries the displayed identity and clearance level. The frontend Administration screen is not an account management backend. Report reviewers require staff status or the explicit report review permission. Review the actual endpoint permissions before relying on role separation across the whole application.

### Back up and restore

Back up db.sqlite3 together with the private_uploads directory using a consistent snapshot, preferably with application writes stopped. The database stores record metadata and histories; the directory stores originals. Saving one without the other is not a complete evidence backup. Keep configuration and deployment secrets under your operational backup process.

Test restoration into a separate installation. Confirm login, record counts, case history, report versions, original downloads, and SHA-256 verification. Git contains source history, not the operational database or uploaded evidence. Earlier repository commits may still contain previously tracked local runtime files; ignore rules do not rewrite old history.

### Update and verify

Before updating, preserve a backup and finish or account for active fetch jobs. Pull reviewed source changes, install changed dependencies, run migrations, and restart the processes. Run manage.py check, relevant backend tests, and the frontend production build. After the update, verify login, claim lookup, draft saving, an evidence download, and report access.

The current configuration is for local development and includes development defaults. A production deployment requires separate configuration for secrets, allowed hosts, HTTPS, storage, process supervision, account governance, and backups. The development server is not a production hosting setup.

## 15 Reference and operational checklists

### State and identifier reference

Claim verdicts describe the statement: Supported, Refuted, Misleading, Out of Context, Synthetic Media, Unverified, or Satire / Parody. Claim priority describes urgency. Case state describes the investigation's progress. Council status describes a processing request. Report status describes the document review cycle. Evidence integrity describes stored-byte consistency.

Claim ID identifies the statement record. Case number identifies the investigation. Evidence ID and SHA-256 identify the repository object and its byte fingerprint. Council run number identifies one stored analysis snapshot. Report ID and version identify a particular document and revision.

### Before submitting a claim assessment

- Confirm the intended claim ID and exact wording.
- Check dates, geography, source context, and evidence relevance.
- Distinguish observed evidence from a local match or heuristic lead.
- Explain the verdict and unresolved gaps in notes.
- Set confidence deliberately.
- Remember that submission changes the visible claim verdict immediately.

### Before advancing a case

- Confirm ownership, priority, and the current state.
- Save notes and evidence references.
- Record what was checked and what remains unresolved.
- Use the state action that reflects the actual completed review.
- Check history after the transition.
- Review the report separately if one exists.

### Before distributing a report

- Confirm the current report ID, version, and status.
- Review title, summary, findings, recommendations, and language.
- Check the source snapshot and case reference.
- Resolve review comments and record the required approval.
- Open and inspect the exported file.
- Use the approved external distribution process.

### Key operating limits

No screen label establishes that a deployment is air-gapped or fully secured. A hash match does not prove content authenticity. A local match does not establish a verdict. A score is not necessarily a probability. A saved council draft is not an approval. Published is an internal application state. Persistent records, real evidence review, and explicit human decisions should support every conclusion.

### Implementation reference

This edition describes baseline fde210a. Screen procedures are supported by the frontend pages; backend behavior is defined in the rumor, cases, authentication, and gpob modules. Recheck this manual after changing those modules.

Repository: https://github.com/Joy50/Narrative
