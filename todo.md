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

## PDF Patient Report Generation
- [x] Create server-side PDF generation using pdfkit or similar
- [x] Include patient demographics (Civil ID, name, DOB, nationality, gender, passport)
- [x] Include complete test history with all results
- [x] Monochrome, printer-friendly design
- [x] Add download PDF button to patient detail page
- [x] Write tests for PDF generation endpoint

## Show Processing Files and Cancel Processing
- [x] Show files currently being processed on Upload page with status
- [x] Add cancel/abort button for pending and processing documents
- [x] Backend endpoint to cancel document processing (set status to discarded)
- [x] Write tests for cancel processing endpoint

## Result-Level Filtering on Patients Page
- [x] Add result filter (Detected/Not Detected) to patient search backend
- [x] Add test type filter to patient search
- [x] Update Patients page UI with filter dropdowns
- [x] Show active filters as badges/chips

## Audit Logging for Cancellations and Exports
- [x] Log document cancellation events (single and batch) with user info
- [x] Log Excel export events with filters used
- [x] Log PDF report generation events
- [x] Create audit log viewer page for admins
- [x] Write tests for audit logging

## Bug Fix: Export Data Page Crash
- [x] Fix Export Data page crashing with "An unexpected error occurred" (empty string SelectItem values)

## Dashboard Analytics Charts
- [x] Backend endpoint: test volume by month (line/area chart)
- [x] Backend endpoint: result distribution breakdown (pie/donut chart)
- [x] Backend endpoint: top test types by count (bar chart)
- [x] Backend endpoint: tests by nationality breakdown
- [x] Add Recharts dependency (was already installed)
- [x] Test volume trend chart (area chart, monthly)
- [x] Result distribution chart (donut chart)
- [x] Top test types chart (horizontal bar chart)
- [x] Tests by nationality chart (bar chart)
- [x] Responsive layout for charts on dashboard
- [x] Write tests for analytics endpoints

## Bulk PDF Export for Multiple Patients
- [x] Backend endpoint to generate combined PDF for multiple patient IDs
- [x] Each patient gets their own section with page break
- [x] Add checkbox selection to Patients page for multi-select
- [x] Add "Export Selected as PDF" button with count badge
- [x] Add "Select All" toggle for current search results
- [x] Monochrome, printer-friendly design matching single patient PDF
- [x] Write tests for bulk PDF export endpoint

## Dashboard Date Range Picker
- [x] Update all four analytics backend endpoints to accept optional from/to date parameters
- [x] Add preset date range buttons (Last 30 days, 3/6/12 months, This year, All time)
- [x] Add custom date range picker with calendar popover
- [x] Wire date range to all chart queries
- [x] Clear date range button
- [x] Fix column name bug (accession_date vs accessionDate) in getTestsByNationality
- [x] Write tests for date range analytics endpoints

## Dashboard Printable PDF Summary Report
- [x] Backend endpoint to generate dashboard PDF with current analytics data
- [x] Include summary stats (total patients, tests, documents, pending)
- [x] Include test volume by month table
- [x] Include result distribution breakdown table
- [x] Include top test types table
- [x] Include tests by nationality table
- [x] Support optional date range filter matching dashboard view
- [x] Monochrome, printer-friendly design
- [x] Add "Download Report" button to dashboard analytics section
- [x] Audit log the report generation
- [x] Write tests for dashboard PDF endpoint

## Bug Fix: Nationality Data Normalization
- [x] Query database to identify all nationality variants/typos (found 7 variants)
- [x] SQL migration to normalize: KUWAITI/Kuwait/KUWAITT → Kuwaiti, NON KUWAITI/NON KUWAIT/NON → Non-Kuwaiti
- [x] Add normalizeNationality() to document processing pipeline to prevent future inconsistencies
- [x] All 86 tests pass after normalization

## Bug Fix: Full Data Normalization (Results, Nationalities, Test Types)
- [x] Query all result variants and normalize: "Not detected" → "Not Detected", empty strings → "Not Available"
- [x] Nationalities already clean (Kuwaiti: 183, Non-Kuwaiti: 59, null: 1)
- [x] Test types already clean - no duplicate variants found
- [x] Add normalizeResult() to document processing pipeline (handles casing, Non Reactive, NEGATIVE, etc.)
- [x] Run tests to verify - all 86 tests pass

## Patient Merge Tool (Admin)
- [x] Backend: duplicate detection algorithm (similar Civil ID, similar name, fuzzy matching)
- [x] Backend: merge procedure - reassign all tests/documents from source to target patient
- [x] Backend: preserve audit trail of merged records
- [x] Backend: delete source patient after successful merge
- [x] Frontend: Patient Merge admin page with duplicate suggestions list
- [x] Frontend: side-by-side comparison of two patient records before merge
- [x] Frontend: select primary (target) patient and confirm merge action
- [x] Frontend: manual search to find and merge any two patients
- [x] Add Patient Merge page to sidebar navigation (admin only)
- [x] Write tests for duplicate detection and merge endpoints (9 tests, all passing)

## Duplicate Detection: Civil ID Only
- [x] Remove name-based and DOB+name matching from findDuplicatePatients()
- [x] Keep only Civil ID similarity detection (normalized comparison)
- [x] Update frontend badges to reflect Civil ID-only matching
- [x] Update tests - all 95 tests pass

## Admin Role Assignment
- [x] Backend: setRole procedure (owner-only) already exists from previous work
- [x] Frontend: Make Admin / Remove Admin button on All Users tab (visible to owner only)
- [x] Audit log role changes (logged to audit_logs table)
- [x] auth.me returns isOwner field for frontend gating

## Pie Chart Result Normalization (Display Only)
- [x] Group results into Positive/Negative/Not Available in the pie chart frontend code
- [x] Keep raw database values unchanged

## Result Normalization: Three Categories (Positive / Negative / Not Available)
- [ ] Query all distinct result values with counts
- [ ] Normalize DB: Reactive, BK Virus Detected, Positive → Positive
- [ ] Normalize DB: Not Detected, Negative, Non Reactive → Negative
- [ ] Normalize DB: Not Available, R NR IND, empty/null → Not Available
- [ ] Update normalizeResult() in document processing pipeline
- [ ] Run tests to verify

## Test Type Bar Chart Normalization (Display Only)
- [x] Query all distinct test type names and identify variants (59 distinct types found)
- [x] Add normalizeTestType() function to group variants in bar chart frontend
- [x] Keep raw database values unchanged

## Bug Fix: Bulk Upload "string didn't match" Error
- [x] Diagnosed: sending 500 images as base64 in one JSON payload exceeds limits
- [x] Fixed: rewritten to upload in sequential batches of 3 files with progress toasts

## Upload Progress Bar
- [x] Add visual progress bar component showing "X/Y files uploaded" during bulk upload
- [x] Replace periodic toast notifications with persistent progress UI
- [x] Show estimated time remaining based on upload rate

## Patient Data Edit Form (Admin)
- [x] Backend: add updateDemographics procedure (admin-only) with audit logging
- [x] Frontend: edit button + dialog on patient detail page for name, DOB, nationality, gender, passport
- [x] Audit log demographic changes (before/after stored in metadata)lds (only Civil ID required)
- [ ] Log edits to audit trail

## Date Range Comparison View
- [x] Add comparison mode toggle on dashboard analytics section
- [x] Allow selecting two date ranges side-by-side with preset options
- [x] Show comparative stats (result distribution, top test types) for both periods
- [x] Show percentage change indicators between periods

## Bug Fix: Mobile Layout - Test Types Overlapping Patient Demographics
- [x] Fix patient detail page mobile layout - header stacks vertically on mobile
- [x] Ensure proper stacking/separation of sections on mobile (break-words, min-w-0, overflow-hidden) (break-words, min-w-0, overflow-hidden)

## Complete Upload System Rebuild
- [x] Server: add multipart upload endpoint (multer) for raw binary file uploads
- [x] Server: add server-side ZIP extraction with adm-zip
- [x] Server: process extracted files sequentially with progress tracking
- [x] Server: support up to 200MB ZIP files and 500+ images
- [x] Frontend: replace base64 tRPC upload with multipart HTTP fetch
- [x] Frontend: add real-time progress bar (upload + processing phases)
- [x] Frontend: automatic retry on network failure
- [x] Frontend: support drag-and-drop for ZIP and bulk images

## Auto-Delete Processed Images from Storage
- [x] Added storageDelete function to storage.ts
- [x] Delete uploaded images from S3 after document processing completes (completed or discarded)
- [x] Ensure deletion happens in the document processing pipeline after OCR extraction
- [x] Keep database records intact, only remove the S3 file bytes

## Light Medical Theme Option
- [x] Add a light theme with clinical white/teal color palette (oklch values)
- [x] Add theme toggle button in sidebar (Sun/Moon icon)
- [x] Persist theme preference in localStorage via ThemeProvider switchable mode
- [x] Ensure all components are readable in both dark and light themes

## Patient Search Autocomplete
- [x] Backend: add autocomplete tRPC endpoint returning top 10 matches by Civil ID or name
- [x] Frontend: debounced input with dropdown suggestions showing Civil ID + name
- [x] Frontend: click suggestion to navigate to patient detail or fill search
- [ ] Write tests for autocomplete endpoint

## Bug Fix: Bulk Upload + ZIP Upload Failed after Upload System Rebuild
- [x] Diagnose "Bulk upload failed: Upload failed" error - express.raw({type:'*/*'}) consuming multipart body before multer
- [x] Diagnose ZIP upload failure - same root cause
- [x] Fix: moved upload routes before body parsers, removed wildcard express.raw middleware

## Bug Fix: Viral Load Trends Legend Cluttering Mobile View
- [x] Redesign Viral Load Trends section on patient detail page for mobile
- [x] Make legend list compact/collapsible instead of long vertical list
- [x] Ensure chart area is usable on small screens

## Viral Load Chart: Only Show with Quantitative Data
- [x] Update hasChartData logic to require 2+ data points with at least one numeric viral load value > 0
- [x] Hide chart entirely for patients with only qualitative results or single-date data

## Bug Fix: Large ZIP File Upload Failing
- [x] Diagnosed: 180MB ZIP exceeds hosting proxy body size limit
- [x] Install JSZip for client-side ZIP extraction in browser
- [x] Update Upload.tsx to extract ZIP files client-side and upload individual files in batches
- [x] ZIP files now extracted in browser, individual files uploaded in batches of 10
- [x] Increased ZIP size limit from 200MB to 500MB
- [x] Added extraction progress UI with progress bar
- [x] Filters out __MACOSX, .DS_Store, and non-image/PDF files
- [x] Test large ZIP upload end-to-end
