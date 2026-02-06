# Virology Dashboard TODO

## Authentication & Users
- [x] User registration and authentication system
- [x] User approval system (pending/approved/banned status)
- [x] Admin user management page with audit logging

## Document Upload & Processing
- [x] Single file upload interface (JPEG, PNG, PDF)
- [x] Bulk upload interface for multiple files
- [x] LLM-powered document processing with vision capabilities
- [x] Extract: Civil ID, patient name, DOB, nationality, test types, results, accession date
- [x] Validation to discard uploads without test results
- [x] S3 storage integration for uploaded documents

## Database & Schema
- [x] Patients table (civilId, name, dob, nationality)
- [x] Virology tests table (testType, result, viralLoad, accessionDate)
- [x] Documents table (S3 URL, metadata, processing status)
- [x] Proper relationships between tables

## Search & Filtering
- [x] Advanced search by Civil ID
- [x] Search by patient name
- [x] Filter by date of birth
- [x] Filter by nationality
- [x] Filter by test type
- [x] Filter by date range (accession date)

## Patient Profile & Display
- [x] Patient profile cards with comprehensive test history
- [x] Display virus type and viral load (copies/mL)
- [x] Show accession date and report metadata
- [x] View original uploaded document

## Dashboard Interface
- [x] Search-focused dashboard design
- [x] Prominent search bar
- [x] Filter controls panel
- [x] Clean, professional medical UI design
- [x] Dark theme with medical aesthetic


## ZIP File Bulk Upload
- [x] Server-side ZIP file extraction
- [x] Process extracted files (JPEG, PNG, PDF) from ZIP
- [x] Update upload interface to accept ZIP files
- [x] Show extraction progress for ZIP uploads

## Duplicate Detection
- [x] Check for duplicate tests by Civil ID, test type, and accession date
- [x] Automatically skip/discard duplicate results during processing
- [x] Show duplicate status in upload results


## Date Range Filters
- [x] Add date picker controls on Patients page
- [x] Filter tests by accession date range
- [x] Clear filters functionality

## Processing Status Notifications
- [x] Real-time status updates for document processing
- [x] Auto-refresh mechanism for pending documents (3-second polling)
- [x] Toast notifications when processing completes
- [x] Auto-refresh for recent documents on dashboard (10-second interval)


## Bug Fixes
- [x] Fix search bar mobile responsiveness - Search button overlapping input field
- [x] Fix document processing failures - added setImmediate for async processing and reprocess button
- [x] Fix ZIP file processing failures - increased body size limit and added logging
- [x] Added debugging logs for file upload flow
- [x] Fix UI stuck in 'processing' state even after data is added - fixed polling logic
- [x] Fix ZIP file processing failure - added 100MB file size limit with clear error message
- [x] Ensure processing completion shows success message - fixed status polling


## Chunked Upload for Large Files
- [x] Implement server-side chunked upload endpoint (chunkManager.ts)
- [x] Update client-side to split large files into 5MB chunks
- [x] Support ZIP files up to 200MB
- [x] Reassemble chunks on server and process
- [x] Tested with 139MB ZIP file containing 751 files


## Viral Load Trend Charts
- [x] Add Recharts line chart to patient profile page
- [x] Display viral load over time for each test type
- [x] Handle multiple test types with different colors
- [x] Show "Not Detected" results as zero or separate indicator

## Batch Reprocessing (Admin)
- [x] Add batch reprocess endpoint for failed/discarded documents
- [x] Create admin UI for batch reprocessing with stats overview
- [x] Show progress and results of batch reprocessing
- [x] Allow filtering by status (failed, discarded)
- [x] Single document reprocess button in failed docs list


## CRITICAL: ZIP File Processing Fix
- [ ] Investigate why ZIP upload fails in browser
- [ ] Test chunked upload with user's 140MB Virology.zip
- [ ] Fix any issues with chunk reassembly or processing
- [ ] Verify complete end-to-end ZIP upload flow works


## Progress Bar for Upload/Processing
- [x] Add visual progress bar component
- [x] Show upload progress for chunked uploads with chunk count
- [x] Show processing progress with animated indicator
- [x] Display progress percentage and status text
- [x] Show file size in MB format


## Estimated Time Remaining
- [x] Track average processing time per document
- [x] Calculate ETA based on pending documents and average time
- [x] Display estimated time remaining during processing
- [x] Update ETA dynamically as documents complete

## Upload Page Rewrite (Bug Fix)
- [x] Rewrite Upload.tsx from scratch - status doesn't correlate with actual processing
- [x] Use document IDs from backend as single source of truth for status
- [x] Simplify state management - remove complex local status tracking
- [x] Properly poll backend for real processing status
- [x] Show ETA based on actual backend processing stats
- [x] Fix status display to reflect actual upload/processing lifecycle

## Folder Drag-and-Drop Support
- [x] Support dragging entire folders into the upload zone
- [x] Recursively extract files from dropped folder entries
- [x] Filter valid file types (JPEG, PNG, PDF) from folder contents
- [x] Show folder name in staged files list

## Bulk Excel Export for Admins
- [x] Create backend endpoint for exporting patients/tests data as Excel
- [x] Support optional filters: date range, test type, nationality, patient name/ID
- [x] Generate statistics-friendly Excel with proper formatting
- [x] Create admin-only Export page with filter UI
- [x] Add Export page to sidebar navigation (admin only)
- [x] Include patient info + all test results in export
