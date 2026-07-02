# Atlas Memory Schema

## Inbox Record
Represents an uploaded file waiting for processing.

Key fields:
- id
- tripId
- tripName
- fileId
- fileUrl
- status
- parserStatus
- notionStatus
- memoryStatus

## Parsed Result
Created by Parser.

Key fields:
- title
- summary
- extractedText
- nextAction

## Semantic Memory
Created by Semantic Extractor.

Contains:
- entities
- relationships

## Memory Snapshot
Created from semantic memory.

Contains:
- sourceInboxId
- tripId
- document
- entities
- relationships
- notion
- status