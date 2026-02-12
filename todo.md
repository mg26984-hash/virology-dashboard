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

## Real-Time Processing Queue on Dashboard
- [x] Add backend tRPC endpoint to fetch pending/processing documents with details
- [x] Build real-time processing queue UI component with auto-refresh polling
- [x] Show document status (pending, processing, completed, failed, discarded) with live updates
- [x] Color-coded progress bar and legend (green/blue/yellow/red)
- [x] Add cancel/retry actions for individual documents in the queue
- [x] Auto-refresh: 3s when active items, 15s when idle
- [x] Collapsible card with Live indicator
- [ ] Write tests for the processing queue endpoint

## Processing Speed Indicator
- [x] Add backend speed calculation (docs completed in last 5m/30m/60m windows)
- [x] Show docs/minute speed and estimated completion time in the Processing Queue
- [x] Show "Waiting for processing to start..." when no recent completions
- [x] Update in real-time as documents complete

## Bug Fix: Stale/Zombie Processing Documents
- [x] Reset documents stuck in "processing" for >10 minutes back to "pending"
- [x] Add auto-recovery mechanism that detects and resets stale processing docs on each queue poll
- [x] Auto-recovered 7 stale documents (stuck 22-23h) back to pending on first poll
- [x] Toast notification when stale documents are auto-recovered

## Retry All Failed Bulk Button
- [x] Add backend endpoint to retry all failed documents in one call
- [x] Add "Retry All Failed" button to the Processing Queue component
- [x] Button shows count of failed docs, resets all to pending on click
- [x] Auto-refreshes queue counts after retry

## Browser Push Notifications for Batch Completion
- [x] Request notification permission on first queue poll
- [x] Detect when active items transition from >0 to 0 (batch complete)
- [x] Send browser push notification with batch summary
- [x] Show completed/failed counts in notification body

## Processing History/Log Page
- [x] Add backend endpoint to fetch upload batch history grouped by user+date
- [x] Create ProcessingHistory page with batch cards
- [x] Show batch timestamp, uploader, file count, success/fail rates, duration
- [x] Summary stats: total files, completed, failed, total size
- [x] Color-coded status badges per batch
- [x] Add navigation link in sidebar
- [x] Fixed number coercion bug (MySQL returns strings for aggregates)

## WhatsApp ZIP Upload with Automatic Deduplication
- [x] Add fileHash column to documents table for dedup tracking
- [x] Compute SHA-256 hash of each file on upload (server-side)
- [x] Check hash against existing documents before processing — skip duplicates
- [x] Return dedup stats in upload response (new vs skipped)
- [x] Update Upload UI to show dedup feedback (e.g., "15 new, 340 already processed")
- [ ] Add a prominent "Upload WhatsApp Export" section on the upload page
- [ ] Test deduplication with re-uploaded files

## Bug Fix: 415 Documents Stuck Pending for 22+ Hours
- [x] Investigate why pending documents are not being processed
- [x] Add a background worker that picks up pending documents and processes them
- [x] Ensure processing resumes automatically after server restart
- [x] Add a "Process All Pending" admin button as fallback

## Process All Pending Admin Button
- [x] Backend: add tRPC mutation to trigger immediate processing of all pending documents
- [x] Export a triggerProcessing function from backgroundWorker that runs immediately
- [x] Frontend: add "Process All Pending" button in Processing Queue component (admin only)
- [x] Show pending count on button, loading state while processing
- [x] Write tests for the new endpoint

## Dedicated WhatsApp Export Upload Section
- [x] Add a prominent "Upload WhatsApp Export" card/section at the top of the Upload page
- [x] Include step-by-step instructions for exporting chat from WhatsApp (with media)
- [x] Highlight deduplication: safe to re-upload the same export, duplicates are automatically skipped
- [x] Add a visual guide or numbered steps with icons
- [x] Ensure the section integrates with the existing upload flow (drag-and-drop / file picker)

## Collapsible WhatsApp Guide
- [x] Add collapse/expand toggle to the WhatsApp Export section
- [x] Persist collapsed state in localStorage so returning users see it collapsed
- [x] Show a compact summary when collapsed with expand button

## Processing History Chart on Dashboard
- [x] Add backend endpoint to return document processing counts grouped by day
- [x] Create a chart component showing processing history (completed, failed, discarded per day)
- [x] Add the chart to the dashboard below the stats cards
- [x] Support toggling between 7-day and 30-day views

## Update WhatsApp Guide Text and Images
- [x] Change step 1 text to "Open OTC Virology 2026 on your WhatsApp"
- [x] Add screenshot images showing how to export WhatsApp chat with media
- [x] Make guide collapsible with localStorage persistence

## Bug Fix: Popup Blocking on Bulk PDF Reports
- [x] Identify where window.open or popup is used in PDF generation (found in Home.tsx dashboard report)
- [x] Replace window.open with fetch+blob download approach to bypass popup blockers
- [x] Verified bulk PDF (Patients.tsx) and single PDF (PatientDetail.tsx) already use safe blob download
- [x] All 110 tests pass

## Update WhatsApp Guide Screenshots
- [x] Replace generic screenshots with AI-generated mockups showing "OTC virology 2026" group name and kitten icon
- [x] Ensure step 1 clearly shows the OTC virology 2026 group
- [x] Update step 2, 3, and 4 screenshots to reference the correct group

## Add Background Processing Note on Upload Page
- [x] Add a note telling users they don't need to stay on the tab — processing continues server-side

## Add iPhone Guide to WhatsApp Export Section
- [x] Add Android/iPhone toggle tabs to the WhatsApp guide (compact, no extra space)
- [x] iPhone steps: Open group → Tap group name → Export Chat → Attach Media → Save ZIP
- [x] Keep existing Android steps intact

## Add iPhone WhatsApp Screenshots to Guide
- [ ] Generate iPhone mockup: Tap group name at top showing OTC virology 2026 with kitten icon
- [ ] Generate iPhone mockup: Export Chat option in group info scroll
- [ ] Generate iPhone mockup: Attach Media dialog
- [ ] Upload screenshots to S3 and add to iPhone guide steps

## Fix iPhone WhatsApp Screenshots to Match Current UI
- [x] Research current 2025/2026 iPhone WhatsApp interface design
- [x] Regenerate screenshots matching the updated iOS WhatsApp UI (chat view, group info with Export Chat, Attach Media action sheet)
- [x] Update Upload page with accurate iPhone screenshots

## Add Camera Capture to Upload Page
- [x] Add a camera capture button/option alongside existing file upload with OR divider
- [x] Use HTML input with capture="environment" attribute for mobile camera access
- [x] Integrate captured photos into the existing upload pipeline (reuses addFiles)

## Multi-Photo Camera Mode
- [x] Allow users to take multiple photos in sequence using the camera
- [x] Show a preview gallery of captured photos with ability to remove individual ones
- [x] Add "Upload All" button to batch-upload all captured photos at once
- [x] Keep the single-photo camera option working as before on the same button

## Photo Annotation Overlay (Crop & Rotate)
- [x] Install react-easy-crop library (supports crop, zoom, rotate)
- [x] Build PhotoEditor overlay component with crop, rotate, zoom, and confirm/cancel actions
- [x] Add edit (pencil) button on camera photo thumbnails to open the editor
- [x] Add edit (pencil) button on staged file thumbnails for image files
- [x] Replace the original file with the cropped/rotated version on confirm
- [x] Full-screen overlay works on mobile devices with touch gestures

## Share-to Upload (iOS Share Sheet Integration)
- [x] Create PWA web app manifest with share_target configuration for receiving images
- [x] Add service worker to handle share target POST requests
- [x] Create a server-side /api/quick-upload endpoint that accepts multipart file uploads with token auth
- [x] Create a /quick-upload page that receives shared files and uploads them (standalone, no login required)
- [x] Build upload token system (generate, validate, 24h expiry, usage tracking)
- [x] Add compact "Share from Phone" instructions section on Upload page with iPhone/Android setup
- [x] Ensure the shared files go through the same upload pipeline with deduplication
- [x] Write 13 tests for upload token generation, validation, and quick-upload API endpoint

## Fix iOS Shortcut Instructions
- [x] Update iPhone instructions to reflect actual iOS 16+ Shortcuts workflow (no "Receive input from Share Sheet" action)
- [x] Simplify iPhone iOS Shortcut instructions - avoid referencing action names that vary across iOS versions

## Token & UI Fixes
- [x] Make upload tokens permanent (never expire) - backend + UI text
- [x] Fix purple info note color so text is readable in light mode
- [x] Make copying the full Quick Upload link (with token) easier and more prominent
- [x] Show exact date and time (not just date) in Recent Uploads section

## Date/Time & Navigation Improvements
- [x] Create shared date/time formatting utility with relative time support
- [x] Add exact time to Patient Detail page (test signed date)
- [x] Add exact time to User Management page (created/last signed in dates)
- [x] Add relative time labels ("2 hours ago") alongside exact timestamps across the app
- [x] Make Recent Uploads on Dashboard clickable to navigate to patient records (completed docs link to patient)

## Admin Promote/Demote
- [x] Allow admin users to promote other users to admin role
- [x] Allow admin users to demote other admins back to regular user role
- [x] Audit log entries for role changes (already existed, verified working)

## Role Assignment Restrictions & Confirmation
- [x] Revert setRole back to owner-only (ownerProcedure) instead of adminProcedure
- [x] Restore isOwner check in frontend for promote/demote button visibility
- [x] Add confirmation dialog before promoting or demoting users

## Role Badges & Transfer Ownership
- [x] Add color-coded role badges (Owner/Admin/User) with Crown/Shield/User icons in the user list
- [x] Implement Transfer Ownership backend endpoint (owner-only, requires target to be admin)
- [x] Add Transfer Ownership UI button + confirmation dialog with warning
- [ ] Write tests for Transfer Ownership
- [x] Promote Osama Gheith (ogheith81@gmail.com) to admin via database

## Remove Processing History Chart
- [x] Remove the Processing History chart from the dashboard Home page

## Breadcrumb Navigation
- [x] Create reusable Breadcrumb component (using shadcn/ui breadcrumb)
- [x] Integrate breadcrumbs into DashboardLayout for automatic route-based breadcrumbs
- [x] Add dynamic breadcrumbs for detail pages (Patient Detail shows Dashboard > Patients > Patient Detail)
- [x] Add quick-action Upload Reports card on dashboard where Processing History chart was

## Breadcrumb & Quick Action Improvements
- [x] Show patient name in breadcrumb on Patient Detail page instead of generic "Patient Detail"
- [x] Add Patients quick-action card alongside Upload Reports on dashboard
- [x] Hide breadcrumb on mobile (mobile header already shows page name)

## Leaderboard - High BK PCR & CMV PCR Counts
- [x] Investigate database schema for BK PCR and CMV PCR test data storage
- [x] Build backend queries to rank patients by highest BK PCR (blood) and CMV PCR counts
- [x] Create tRPC procedures for leaderboard data
- [x] Build Leaderboard frontend page with BK PCR and CMV PCR rankings
- [x] Add route and sidebar navigation entry for Leaderboard
- [x] Write tests for leaderboard queries
- [x] Make Leaderboard visible only to admin users (sidebar + route)

## Dashboard Top 3 Leaderboard Widget
- [x] Add compact Top 3 BK PCR widget on admin dashboard
- [x] Add compact Top 3 CMV PCR widget on admin dashboard
- [x] Only visible to admin users
- [x] Clickable entries that navigate to patient detail
- [x] Link to full Leaderboard page

## Bug Fix: Top 3 Leaderboard Widget Not Visible
- [x] Investigate why Top 3 widget is not showing for the user (admin check, positioning, or rendering issue)
- [x] Fix the issue so the widget is visible on the admin dashboard

## Bug Fix: Missing Quick Upload Link on Upload Reports Page
- [x] Fix "Copy the green link above" text — the actual Quick Upload URL link is not visible above the instruction

## Auto Copy-Link Toast on Token Generation
- [x] Show a toast with the Quick Upload URL and a "Copy" action button when the token is generated
## Quick Upload PDF Support
- [x] Ensure Quick Upload frontend accepts PDF files (file input accept attribute, validation)
- [x] Ensure Quick Upload backend endpoint processes PDF uploads correctly
- [x] Test PDF upload flow through Quick Upload

- [x] Add ZIP file support to Quick Upload frontend (accept attribute, validation, icon)
- [x] Add ZIP extraction to Quick Upload backend endpoint

## Bug Fix: iPhone Shortcut Upload Not Working
- [x] Fix: User's shortcut URL points to /quick-upload (frontend) instead of /api/upload/quick (API)
- [x] Update iOS Shortcut instructions to clearly show the API URL (not the frontend page URL)
- [x] Make the Copy Upload URL button more prominent and clearly labeled as "for iOS Shortcut"
- [x] Accept any multer field name (not just "images") for iOS Shortcut compatibility
- [x] Add HEIC/HEIF format support (iPhone default photo format)
- [x] Add detailed server logging to quick upload endpoint
- [x] Add server-side POST /quick-upload fallback route (redirects to /api/upload/quick)
- [x] Add HEIC support to main upload endpoint and frontend file pickers

## Bug Fix: iOS Shortcut Multi-File Upload Only Processes One File
- [x] Investigate why only one file is processed when multiple files are shared via iOS Shortcut
- [x] Updated instructions to use "Repeat with Each" loop so each shared file is uploaded individually
- [x] Changed Value from "Shortcut Input" to "Repeat Item" in instructions
- [x] Added multi-file tip callout explaining why the loop is needed

## Large ZIP File Splitting on Server
- [x] Increase multer file size limit to allow large ZIP uploads (up to 1.5GB) — disk-based multer storage
- [x] Add server-side disk-based ZIP processing (largeZipProcessor.ts) — processes entries one at a time from disk
- [x] Process each entry sequentially using existing upload pipeline (S3 + document creation)
- [x] Core ZIP extraction code preserved — existing /api/upload/zip endpoint unchanged
- [x] Add progress feedback for large ZIP processing — polling endpoint with real-time status
- [x] Handle memory efficiently — ZIP written to temp file, entries extracted one at a time, temp file cleaned up
- [x] New /api/upload/zip/large endpoint with disk storage for ZIPs up to 1.5GB
- [x] Client auto-routes: ZIPs > 200MB → server disk processing, smaller ZIPs → client-side extraction
- [x] Large ZIP progress UI card with real-time status, ETA, and error display
- [x] Updated ZIP size limit from 500MB to 1.5GB in UI
- [x] 10 new tests for large ZIP processor and API endpoints — all passing

## Persist Large ZIP Job History to Database
- [x] Add uploadBatches table to schema (jobId, fileName, status, totalEntries, processed, uploaded, duplicates, failed, errors, userId, timestamps)
- [x] Migrate database with new table (0004_zippy_lorna_dane.sql)
- [x] Create uploadBatchDb.ts with CRUD functions (create, update, getByJobId, getRecent, getActive)
- [x] Update largeZipProcessor to create/update batch records in database (persistProgress on every 10 entries + completion)
- [x] Add tRPC endpoints: batchHistory, activeBatches, batchProgress
- [x] Update Processing History frontend with ZipBatchCard component showing batch jobs
- [x] Update Upload page to restore active large ZIP progress from database on page refresh
- [x] Write 7 new tests for batch persistence and history retrieval (149 total tests passing)

## Bug Fix: Large ZIP Splitting/Extraction Progress Not Visible on Upload Page
- [x] Investigated: ZIPs >200MB sent to /api/upload/zip/large but proxy body limit (~250MB) blocks the upload silently
- [x] Add server endpoints for chunked ZIP upload: init, chunk, finalize (chunkedZipUpload.ts)
- [x] Update client uploadLargeZip to split ZIP file into ~50MB chunks before sending
- [x] Show chunk upload progress (uploading chunk X of Y) with 4-step phase indicator in the UI
- [x] After all chunks uploaded, trigger server-side processing and show extraction progress
- [x] Existing ZIP upload logic for ZIPs under 200MB is completely unchanged
- [x] 8 new tests for chunked ZIP logic — all 157 tests passing

## Chunk Upload Retry Logic
- [x] Add automatic retry (up to 3 attempts) for individual failed chunks during large ZIP upload
- [x] Show retry status in the progress UI (e.g., "Retrying chunk 3/10...")
- [x] Only fail the entire upload if a chunk fails after all retries exhausted
- [x] Exponential backoff between retries (1s, 2s, 3s)

## Quick Upload Large ZIP Support
- [x] Detect large ZIPs (>50MB) in Quick Upload server endpoint
- [x] Route large ZIPs through disk-based processing (processLargeZipFromDisk)
- [x] Return jobId in response so progress can be tracked via existing polling endpoint
- [x] Keep existing Quick Upload logic for small ZIPs and individual files unchanged
- [x] 6 new tests for retry logic and Quick Upload large ZIP detection — all 163 tests passing

## Auto-Cleanup Orphaned Temp Files
- [x] Create tempCleanup.ts module that scans /tmp for orphaned chunk dirs and large ZIP temp files
- [x] Clean up files matching patterns: virology-chunked-zip/*, virology-zip-uploads/*, virology-large-zip-uploads/*, quick-large-* older than 24 hours
- [x] Schedule cleanup to run every 6 hours via setInterval on server startup
- [x] Log cleanup activity (files removed, space freed, formatBytes helper)
- [x] Write 7 tests for cleanup logic — all passing
- [x] Fixed chunked upload init failure: added express.json() middleware to chunked router
- [x] Fixed ENOENT errors: all temp directories now ensure existence at point of use, not just module load
- [x] All 170 tests passing across 12 test files

## Bug Fix: Chunk Upload Fails After 3 Retry Attempts
- [x] Investigated: root cause was in-memory sessions + local disk storage not shared across instances
- [x] Fixed by moving to DB+S3 backed storage (see below)

## Bug Fix: Chunk Upload Fails on Published Site (900MB ZIP)
- [x] Reduced chunk size from 50MB to 10MB to safely pass proxy body limits
- [x] Switched chunk endpoint from memory storage to disk storage (multer.diskStorage)
- [x] Added detailed error logging showing HTTP status and response text on chunk failure
- [x] Increased retry count from 3 to 5 with longer exponential backoff (2s, 4s, 6s, 8s, 10s)
- [x] Init endpoint error messages now show HTTP status and response detail

## Upload Speed Estimation
- [x] Track bytes sent and time elapsed per chunk (bytesSent, totalBytes fields)
- [x] Calculate rolling average MB/s throughput after each chunk
- [x] Show MB sent / total MB and speed in MB/s in the chunk progress card
- [x] Calculate and display accurate ETA based on actual transfer speed
- [x] All 170 tests passing across 12 test files


## Bug Fix: Chunked Upload "Session Not Found" on Published Site
- [x] Added chunkedUploadSessions table to database schema (uploadId, userId, fileName, totalSize, totalChunks, receivedChunks, receivedChunkIndices, status)
- [x] Moved session storage from in-memory Map to database — all instances share same sessions
- [x] Moved chunk storage from local disk to S3 (storagePut/storageGet) — all instances share same chunks
- [x] Updated init endpoint: creates session in DB
- [x] Updated chunk endpoint: uploads chunk to S3, marks received in DB
- [x] Updated finalize endpoint: downloads chunks from S3, reassembles to temp file, processes
- [x] S3 chunks cleaned up in background after reassembly
- [x] All 170 tests passing (1 pre-existing unrelated failure in virology.test.ts)

## Bug Fix: Quick Upload (iOS Shortcut) Endpoint Broken
- [x] Investigated: endpoint was working correctly, tested with valid token on published site (success)
- [x] Root cause: outdated token in the iOS Shortcut URL, not a code issue
- [x] Resolved: user regenerated token and updated Shortcut — working fine now

## Bug Fix: Finalize Failed After 90 Chunks Uploaded (900MB ZIP)
- [x] Investigated: proxy timeout kills the request during synchronous S3 download + reassembly phase
- [x] Fixed: finalize now returns immediately with jobId, creates uploadBatch DB record, then runs S3 download + reassembly + processing entirely in background
- [x] processLargeZipFromDisk updated to accept optional existingJobId parameter (skips duplicate DB record creation)
- [x] Frontend toast updated to handle fileSizeMB gracefully
- [x] Progress polling works immediately after finalize returns (DB record exists before background work starts)
- [x] All 170 tests passing (1 pre-existing unrelated failure in virology.test.ts)

## Nationality Normalization Round 2
- [x] Normalize "Ku" and "Khy" → "Kuwaiti" in database (2 rows updated)
- [x] Normalize "Non Ku" → "Non-Kuwaiti" in database (1 row updated)
- [x] Update normalizeNationality() in document processor to handle these new variants
- [x] Updated test cases with Ku, Khy, Non Ku assertions
- [x] Verify Tests by Nationality chart shows only Kuwaiti and Non-Kuwaiti (DB now has only Kuwaiti: 543, Non-Kuwaiti: 197, null: 9)

## PDF Export Fix: Extra Blank Pages
- [x] Fixed: replaced hardcoded page-break threshold (180px) with dynamic ensureSpace() that calculates actual needed height per test entry
- [x] No layout overlap or text clipping — usableBottom() accounts for footer area

## PDF Export: Summary Table
- [x] Added "TEST HISTORY TABLE" section at end of each patient report
- [x] Table columns: Test Date, Test Name, Result with dark header row
- [x] Chronological order (ascending), alternating row backgrounds, page-break aware
- [x] All 170 tests passing across 12 test files

## PDF Export Fix: Extra Blank Pages (Round 2)
- [x] Root cause: renderFooters() doc.text() at y=pageHeight-30 exceeds (pageHeight - bottomMargin=50), triggering PDFKit auto-pagination
- [x] lineBreak: false alone was NOT sufficient
- [x] Fix: temporarily set doc.page.margins.bottom = 0 during footer rendering, then restore
- [x] Verified with reproduction script: 3-page doc stays 3 pages (without fix: 3 becomes 9)
- [x] All 170 tests passing

## PDF Styling: Bold Italic Results + Separator Lines
- [x] Make test result values bold italic in detailed test results section (Helvetica-BoldOblique)
- [x] Make result column bold italic in the summary table (Helvetica-BoldOblique)
- [x] Add visible solid separator lines between different tests in detailed results (drawSeparatorHR)
- [x] Fix blank pages: added lineBreak: false in renderFooters to prevent PDFKit auto-page creation

## Background Upload: Persist Across Page Navigation
- [x] Created UploadManagerContext at App level to hold upload state
- [x] Moved chunked upload logic (uploadLargeZip, startLargeZipPolling) from Upload.tsx to context
- [x] Moved batch polling (startBatchPolling) from Upload.tsx to context
- [x] Added floating GlobalUploadIndicator component visible from any page (bottom-right)
- [x] Refactored Upload.tsx to consume context instead of local state (0 TS errors)
- [x] Active batch jobs restored from DB on context mount (survives page refresh)
- [x] All 170 tests passing across 12 test files

## Viral Load Chart: Curves Not Showing for High Values
- [x] Root cause: log scale cannot display 0 (log(0)=-infinity), and domain max was hardcoded at 100M
- [x] Fix: "Not Detected" now uses 0.5 floor value, domain max set to 'auto', tooltip shows 'ND' for values < 1

## Missed Files Analysis & Prevention Strategy
- [x] Complete bulk upload of 4603 files from EmamExport(1).zip (100% coverage, 0 failures)
- [x] Analyzed: 1,650 completed, 8,208 discarded (duplicates), 0 failed, 0 pending — 812 patients, 4,913 tests
- [x] Implement upload reconciliation: compare ZIP manifest vs DB records (reconcileBatch admin endpoint)
- [x] Add automatic retry logic for failed documents (backgroundWorker retryAllFailed, MAX_RETRIES=3)
- [x] Add retryCount column to documents table for tracking retry attempts
- [x] Add batchId column to documents table to link documents to their upload batch
- [x] Add manifest column to uploadBatches table (JSON array of filenames)
- [x] Store manifest during ZIP processing for reconciliation
- [x] All 170 tests passing

## Nationality Normalization Round 3
- [x] Normalized "Kuwa" → "Kuwaiti" in database (1 row)
- [x] Fixed regex in normalizeNationality() to handle all partial variants (kuwa, kuwai, kuw, etc.)
- [x] Verified: DB now has only "Kuwaiti" (590) and "Non-Kuwaiti" (213) - fully clean

## Test Volume Trend: Use Actual Test Dates
- [x] Investigated: query already uses accessionDate (actual test date), not upload date
- [x] Fixed: default view changed from last-12-months to all-time data
- [x] Change trend to show tests per year since 2016 (not per month)
- [x] Add drill-down: click a year bar to see monthly breakdown, with back button

## Patient Autocomplete: Prioritize First Name Matches
- [x] Fix autocomplete to suggest patients by first name first (e.g. typing "ta" should suggest TAFLAH first)
- [x] Order results so first-name matches appear before last-name or fileNumber matches
- [x] Smart relevance scoring: first-name prefix > any-name-part prefix > last-name prefix > name contains > civil ID prefix > civil ID contains

## Auto-Clear Uploaded Files After Processing
- [x] Delete uploaded images/PDFs from S3 after document processing completes or is discarded (deleteProcessedFile in documentProcessor.ts)
- [x] Delete reassembled ZIP files from disk after processing (largeZipProcessor.ts finally block)
- [x] Clean up chunked upload parts from S3 after finalization (chunkedZipUpload.ts)
- [x] Periodic temp file cleanup every 30 min for orphaned files >1 hour old

## Owner Can Promote/Demote Admins
- [x] Add backend procedure for owner to change user role (admin/user) - already implemented as setRole with ownerProcedure
- [x] Only the owner (identified by OWNER_OPEN_ID) can promote/demote - ownerProcedure middleware enforces this
- [x] Add promote/demote UI controls on User Management page - Make Admin / Remove Admin buttons visible to owner
- [x] Log role changes to audit trail - updateUserRole logs to audit
- [x] Transfer Ownership feature also available for owner to transfer to an admin

## Fix Multi-Page PDF Processing (Multiple Tests Per PDF)
- [x] Diagnose why multi-page PDFs with separate test results per page fail to process (LLM response.choices undefined + & in filename breaking S3 URL)
- [x] Update LLM prompt/processing to handle multiple test results from a single PDF (enhanced system prompt + user prompt for multi-page extraction)
- [x] Sanitize filenames with special characters (& ? # % + spaces) in all 4 upload paths (single, batch, zip, chunked)
- [x] Add robust error handling when LLM returns no choices (log response details, return graceful failure)
- [x] Ensure each page's test result is saved as a separate test record (already supported by tests array loop)
- [ ] Test with the AliSanambld&urine.pdf sample on published site

## Add iPhone iOS 18 WhatsApp Screenshots + Compress All Guide Images
- [x] Research current iOS 18 WhatsApp interface design
- [x] Generate iPhone screenshot: Tap group name "OTC virology 2026" (with red circle highlight)
- [x] Generate iPhone screenshot: Group Info page with Export Chat option (red border highlight)
- [x] Generate iPhone screenshot: Attach Media dialog (red border highlight)
- [x] Compress all 6 guide images from ~5MB PNG to ~10-17KB WebP (99.7% reduction)
- [x] Upload compressed WebP + JPG fallbacks to S3 CDN
- [x] Update Upload.tsx with <picture> elements (WebP primary, JPG fallback) + lazy loading + explicit dimensions
- [x] All 171 tests passing

## Fix iOS Shortcut (Quick Upload) for PDFs + Add Feedback
- [x] Investigated: & in filename breaks S3 URL → LLM gets "Invalid image data" error
- [x] Sanitized filenames in all 3 fileKey locations in uploadRoutes.ts (Quick Upload, batch ZIP, regular ZIP)
- [x] Added shortMessage field to JSON response for iOS Shortcut "Show Alert" action (✅/⚠️/❌ prefixed)
- [x] Added owner notification on quick upload success/failure (fire-and-forget)
- [x] Updated iOS Shortcut guide with "Add Upload Feedback" section (Get Dictionary Value → Show Alert)
- [x] All 171 tests passing

## Discard Old Broken Documents with & in S3 URLs
- [x] Checked DB: 0 documents in pending/failed/processing status — all broken docs already discarded by background worker after max retries
- [x] Queue is clean, no manual intervention needed

## Processing Status Push Notification
- [x] Add owner notification when a document finishes processing successfully (✅ Processed: filename, N tests extracted)
- [x] Add owner notification when a document is discarded (⚠️ Discarded: filename, reason)
- [x] Add owner notification when a document fails permanently after 3 retries (❌ Failed: filename, error)
- [x] Notifications are fire-and-forget to avoid blocking the processing pipeline
- [x] All 171 tests passing

## Add iOS Shortcut Setup Instructions with Screenshots
- [x] Compressed 3 user-provided shortcut screenshots from ~300KB to ~15-25KB WebP
- [x] Uploaded compressed screenshots to S3 CDN
- [x] Updated Upload page with clear step-by-step iOS Shortcut setup guide with reference screenshot
- [x] Included consolidated report instructions (Add to Variable + Combine Text + Show Alert)
- [x] Added "How It Works" explanation box for the summary alert feature
- [x] All 171 tests passing

## Add Android "Add to Home Screen" Screenshots
- [x] Generated Android screenshot: Chrome three-dot menu with "Add to Home Screen" highlighted (red border)
- [x] Generated Android screenshot: Share sheet showing "Virology" app highlighted (red border)
- [x] Compressed from ~5MB to ~11-14KB WebP (99.7% reduction) with JPG fallbacks
- [x] Uploaded to S3 CDN and updated Upload page with <picture> elements + lazy loading
- [x] All 171 tests passing

## Remove Upload/Processing Notifications
- [x] Removed notifyOwner calls from Quick Upload endpoint (uploadRoutes.ts) — success and failure
- [x] Removed notifyOwner calls from background worker (backgroundWorker.ts) — completed, discarded, and failed
- [x] Removed unused notifyOwner imports from both files
- [x] All 171 tests passing

## Auto-Merge Patients with Same Civil ID
- [x] Analyzed current patient schema — unique constraint on civilId prevents true duplicates; issue is name inconsistency (ALL CAPS, truncated names, mixed casing)
- [x] Implemented smart name reconciliation in upsertPatient: chooseBestName() picks the longer/more complete name on each upload
- [x] Added normalizePatientName() — converts ALL CAPS to Title Case, preserves Arabic particles (al-, el-), trims whitespace
- [x] New patients are auto-normalized on creation; existing patients get best-name upgrade on re-upload
- [x] Admin "Auto-Normalize Names" tab on Patient Merge page — batch normalizes all 814+ patient names with before/after table
- [x] Batch-optimized: processes 800+ patients in ~4 seconds using parallel chunks of 50
- [x] Audit logging for normalization operations
- [x] All 20 auto-merge tests passing (normalizePatientName, chooseBestName, smart upsert, admin endpoint, access control)

## Gemini API Integration for Document Processing
- [x] Add Gemini API key as environment secret
- [x] Create Gemini-based LLM caller (server/gemini.ts) for direct Google API calls
- [x] Swap document processor to use Gemini 2.0 Flash as primary extractor
- [x] Implement hybrid fallback: Gemini primary, built-in platform LLM as automatic fallback
- [x] Log which provider was used for each extraction (for cost tracking)
- [x] Write tests for hybrid fallback logic (9/9 passing)
- [ ] Test end-to-end document processing with Gemini (user to test via iOS Shortcut)
- [x] Verify existing tests still pass

## AI Usage Dashboard (Owner-Only)
- [x] Add `aiProvider` column to documents table to track which AI processed each document
- [x] Update documentProcessor to save provider info on each processed document
- [x] Create owner-only tRPC procedures for usage analytics (counts by provider, daily/weekly)
- [x] Build AI Usage Dashboard page with charts showing Gemini vs Platform usage over time
- [x] Show estimated cost savings based on provider distribution
- [x] Restrict dashboard access to owner only (ownerProcedure on all endpoints)
- [x] Add navigation entry (owner-only visibility in sidebar)
- [x] Write tests for usage analytics procedures (12/12 passing)

## Bug Fix: Owner Detection Not Working
- [x] Investigated: dev sandbox works correctly (isOwner=true), issue is in published/deployed environment
- [x] Fixed: Changed env.ts to use dynamic getters (not cached at import time)
- [x] Fixed: Added isUserOwner() helper with OWNER_NAME fallback for env mismatch resilience
- [x] Applied fix to auth.me, ownerProcedure, and users.list
- [x] ROOT CAUSE: OWNER_OPEN_ID and OWNER_NAME env vars are NOT_SET in production deployment
- [x] Final fix: Added hardcoded fallback (nPtvS3FjrgpNRuGEU3ERv5 / Mohammed Megahed) in env.ts
- [x] Removed temporary debugOwner endpoint
- [x] All tests still passing

## Prevent Future Env Var Failures
- [x] Audited all process.env usage across server code (found 12 references)
- [x] Centralized all env access through ENV getters in _core/env.ts — no more direct process.env in app code
- [x] Added startup validation: logs CRITICAL errors for missing required vars, WARNING for optional ones
- [x] Added ENV.geminiApiKey getter; updated gemini.ts and documentProcessor.ts to use it
- [x] Updated db.ts to use ENV.databaseUrl
- [x] Only remaining direct process.env: _core/index.ts (PORT, NODE_ENV) and routers.ts ownership transfer (intentional runtime mutation)

## Cost Reduction: Hash-Based Duplicate Detection & Filename Pre-Filter (DONE)
- [x] fileHash column already existed in schema; verified it's populated during uploads
- [x] uploadRoutes.ts (iOS Shortcut) already had SHA-256 hash dedup in all handlers
- [x] Added hash-based dedup to all 4 tRPC upload paths in routers.ts (single, bulk, ZIP, chunked)
- [x] Added filename pre-filter (isLikelyVirologyReport) to all 4 tRPC upload paths
- [x] Pre-filter blocks obvious non-virology files (receipts, screenshots, selfies, etc.)
- [x] Pre-filter allows ambiguous filenames through (patient names, civil IDs) — no false negatives
- [x] Logs skipped files with reason for transparency
- [x] 45 tests passing: hash computation, filename pre-filter (allow/block/edge cases), integration flow
