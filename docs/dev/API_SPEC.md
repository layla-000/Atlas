# Atlas API Spec

Base endpoint: Google Apps Script Web App URL

## GET actions

### ?action=brief
Returns latest Atlas Brief.

### ?action=status
Returns Travel Status.

### ?action=memory
Returns recent Atlas Memory snapshots.

### ?action=inbox
Returns recent Documents Inbox records.

### ?action=queue
Returns queued Inbox records..

## POST upload

Uploads a file payload and creates an Inbox record..

Response includes:
- fileId
- fileUrl
- inboxId
- parserStatus
- notionStatus
- memoryStatus