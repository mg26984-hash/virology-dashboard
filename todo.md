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
