# Atlas Architecture

## Current flow

Web Dashboard
→ Atlas API Layer
→ Google Apps Script Backend
→ Google Drive
→ Documents Inbox
→ Parser
→ Knowledge Object Generator
→ Semantic Extractor
→ Notion Writer
→ Atlas Memory
→ Reasoning Engine
→ Brief Generator
→ Dashboard

## Frontend

Located in `docs`.

Main roles:
- render dashboard
- upload documents
- call AtlasAPI
- display Brief and Travel Status

## Backend

Located in `backend`.

Main roles:
- receive uploads
- save files to Google Drive
- manage Inbox queue
- parse documents
- generate semantic memory
- sync to Notion
- create Atlas Brief

## Design rule

Dashboard should call `AtlasAPI`.
Dashboard should not call backend directly with raw `fetch`.