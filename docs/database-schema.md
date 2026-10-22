# Database Schema — University Internship Platform

**สถานะ:** Logical schema สำหรับงาน SA, Week 1<br>
**อ้างอิง:** `docs/architecture.md`, `docs/api-contract.md`, `docs/event-contract.md`

เอกสารนี้กำหนดตาราง ฟิลด์สำคัญ ความสัมพันธ์ และข้อบังคับของข้อมูลสำหรับ 4 Microservices เป็นแบบฐานข้อมูลเชิงสัมพันธ์ที่ยังไม่ผูกกับ PostgreSQL/MySQL/SQLite เมื่อทีมเลือก DBMS แล้วจึงแปลงชนิดข้อมูลและ partial indexes เป็น migration จริง

## 1. หลักร่วมของฐานข้อมูล

- แต่ละ Service มี database/schema ของตนเองและเป็นเจ้าของการเขียนข้อมูลนั้นเท่านั้น **ห้ามสร้าง foreign key ข้าม Service**; ID ภายนอกเก็บเป็น UUID string และตรวจสิทธิ์/สถานะกับบริการเจ้าของข้อมูลเมื่อทำธุรกรรมสำคัญ
- `UUID`, `VARCHAR(n)`, `TEXT`, `INTEGER`, `BOOLEAN`, `DATE`, `DECIMAL(12,2)`, `TIMESTAMP_UTC`, `JSON` ในเอกสารเป็น logical types; timestamp เก็บ UTC ส่วนกฎวันฝึกงานและอายุ On-Site ใช้วันตาม `Asia/Bangkok`
- ทุกตารางธุรกิจมี `created_at TIMESTAMP_UTC`; ตารางที่แก้ไขได้มี `updated_at TIMESTAMP_UTC` ด้วย เว้นแต่ระบุเป็นอย่างอื่น
- Enum ที่อ้างถึงใช้ค่าตาม `docs/api-contract.md`; ฐานข้อมูลมี `CHECK` หรือ enum type เพื่อกันค่าอื่นหลุดเข้ามา
- ไฟล์ KYB, Resume และ Certificate เก็บใน private object/file storage; DB เก็บเพียง storage key และ metadata ไม่เก็บ byte ของไฟล์ในตารางหรือ Event
- ฟิลด์ JSON ใช้กับรายการที่ไม่มีการ join ตามรายการย่อยใน MVP เช่น `benefits`, `skills`, `score_reasons`; ฟิลด์ที่ต้องบังคับ unique หรือค้นหาบ่อยแยกเป็นคอลัมน์/ตาราง
- การลบข้อมูลธุรกิจที่มีการอ้างอิงให้ใช้สถานะปิด/ยกเลิกหรือ soft delete ตามกรณี ไม่ cascade ลบหลักฐานการตรวจ, Report, รีวิว หรือใบรับรอง

## 2. Identity & Company KYB DB

### 2.1 ตารางหลัก

| ตาราง | คอลัมน์สำคัญ | Key และข้อบังคับ |
| --- | --- | --- |
| `users` | `id UUID`, `email_normalized VARCHAR(320)`, `password_hash TEXT`, `display_name VARCHAR(160)`, `role`, `company_id UUID NULL`, `disabled_at TIMESTAMP_UTC NULL` | PK `id`; UNIQUE `email_normalized`; FK `company_id → companies.id` ใน Service เดียวกัน; `COMPANY_HR` ต้องมี `company_id`, บทบาทอื่นต้องเป็น `NULL` |
| `companies` | `id UUID`, `name VARCHAR(240)`, `verified_registration_hash VARCHAR(128) NULL`, `kyb_status`, `tier INTEGER`, `on_site_visited_on DATE NULL`, `on_site_verified_until DATE NULL`, `tier_updated_at TIMESTAMP_UTC` | PK `id`; UNIQUE `verified_registration_hash` เมื่อไม่เป็น `NULL`; CHECK `tier IN (0,1,2)`; Tier 0 จนกว่า Admin อนุมัติ KYB |
| `kyb_submissions` | `id UUID`, `company_id UUID`, `submitted_by_user_id UUID`, `registration_number_encrypted TEXT`, `registration_number_hash VARCHAR(128)`, `document_storage_key TEXT`, `document_mime VARCHAR(100)`, `document_size_bytes INTEGER`, `provider_reference TEXT NULL`, `provider_result`, `status`, `admin_user_id UUID NULL`, `decision_reason TEXT NULL`, `submitted_at TIMESTAMP_UTC`, `decided_at TIMESTAMP_UTC NULL` | PK `id`; FK `company_id → companies.id`, `submitted_by_user_id → users.id`, `admin_user_id → users.id`; อนุญาต submission ที่ยังเปิดอยู่ได้ไม่เกิน 1 รายการต่อบริษัท |
| `company_tier_history` | `id UUID`, `company_id UUID`, `previous_tier INTEGER`, `new_tier INTEGER`, `reason`, `source_event_id UUID NULL`, `changed_at TIMESTAMP_UTC` | PK `id`; FK company; audit ทุกครั้งที่ Tier หรือ On-Site Badge เปลี่ยน |

`registration_number_encrypted` เก็บเลข 13 หลักแบบเข้ารหัสเพื่อให้ Admin ตรวจ; ฟิลด์ที่ลงท้าย `_hash` ใช้ keyed HMAC เพื่อเทียบซ้ำโดยไม่เก็บเลขทะเบียนเป็นข้อความธรรมดาและไม่ส่งออก API สาธารณะ เมื่ออนุมัติ KYB ให้คัดลอก HMAC ไป `companies.verified_registration_hash` ภายใน transaction เดียวกับการเปลี่ยน Tier หากซ้ำกับบริษัทที่ยืนยันแล้วให้ปฏิเสธการอนุมัติ

`on_site_verified_until` เป็น **วันสิ้นสุดแบบ exclusive**: ลงพื้นที่วันที่ 2026-10-23 → หมดอายุเมื่อเริ่มวันที่ 2027-10-23 ตามเวลาไทย Badge ใช้ได้เมื่อ `today < on_site_verified_until` การอ่าน posting context ต้องคำนวณจากวันปัจจุบัน ไม่พึ่ง scheduler อย่างเดียว; งาน background อัปเดต history และส่ง `CompanyTrustChanged` เมื่อหมดอายุ

การรับผล `OnSiteVerificationPassed` ต้องตรวจว่าบริษัทผ่าน e-KYB และเป็น Tier 2 ก่อนตั้งวันหมดอายุ เพื่อให้ Tier 2+ มีความหมายตรงกับกฎความน่าเชื่อถือ

### 2.2 หลักฐานสำหรับเลื่อน Tier

| ตาราง | คอลัมน์สำคัญ | Key และข้อบังคับ |
| --- | --- | --- |
| `approved_job_evidence` | `source_event_id UUID`, `company_id UUID`, `job_id UUID`, `job_version INTEGER`, `approval_method`, `approved_at TIMESTAMP_UTC` | PK `source_event_id`; FK company; UNIQUE `(job_id, job_version)`; เก็บทุกครั้งที่ Job เข้าสู่ `PUBLISHED` เพื่อให้ PM เลือกวิธีนับภายหลัง |
| `internship_result_evidence` | `internship_id UUID`, `source_event_id UUID`, `company_id UUID`, `assessment_result`, `completed_on DATE` | PK `internship_id`; UNIQUE `source_event_id`; FK company; Pass อย่างน้อย 1 รายการจึงผ่านเงื่อนไขผลฝึกงาน |
| `company_report_evidence` | `report_id UUID`, `source_event_id UUID`, `company_id UUID`, `job_id UUID`, `reported_at TIMESTAMP_UTC` | PK `report_id`; UNIQUE `source_event_id`; FK company; ใช้บันทึกว่าบริษัทเคยถูก Report |
| `on_site_pass_evidence` | `verification_id UUID`, `source_event_id UUID`, `company_id UUID`, `visited_on DATE`, `supervisor_user_id UUID` | PK `verification_id`; UNIQUE `source_event_id`; FK company; อัปเดตวันหมดอายุจากผลตรวจล่าสุดที่มีสิทธิ์ใช้ |

การเลื่อน Tier 2 ต้องตรวจ `approved_job_evidence`, `internship_result_evidence` และเรียก report-history ปัจจุบันจาก Verification ก่อน commit; หาก Verification ไม่พร้อมให้คง Tier เดิม นโยบายการนับอนุมัติ 3 ครั้งและการลด Tier 2 เมื่อมี Report ภายหลังยังเป็นข้อเปิดของ PM จึงไม่ฝังกฎการนับไว้ใน unique constraint

### 2.3 ดัชนีหลัก

- `users(email_normalized)` UNIQUE สำหรับ login; `users(company_id, role)` สำหรับ HR ของบริษัท
- `kyb_submissions(company_id, submitted_at DESC)` และ `(status, submitted_at)` สำหรับ Admin queue
- `companies(verified_registration_hash)` UNIQUE เมื่อมีค่า; `companies(on_site_verified_until)` สำหรับงานตรวจหมดอายุ
- ตาราง evidence ทุกตัวมี index `(company_id, ...)` เพื่อคำนวณ Trust Tier

## 3. Job Management DB

| ตาราง | คอลัมน์สำคัญ | Key และข้อบังคับ |
| --- | --- | --- |
| `jobs` | `id UUID`, `company_id UUID`, `created_by_hr_id UUID`, `status`, `current_version INTEGER`, `submitted_at TIMESTAMP_UTC NULL`, `risk_score INTEGER NULL`, `moderation_hold BOOLEAN`, `closed_at TIMESTAMP_UTC NULL` | PK `id`; `current_version >= 1`; `moderation_hold = true` ห้ามเข้าสู่ `PUBLISHED`; `company_id` และ HR ID เป็น cross-service reference ไม่มี FK |
| `job_revisions` | `job_id UUID`, `version INTEGER`, `job_title VARCHAR(240)`, `description TEXT`, `category`, `benefits JSON`, `allowance_amount DECIMAL(12,2) NULL`, `allowance_currency CHAR(3) NULL`, `allowance_period NULL`, `edited_by_hr_id UUID`, `recorded_at TIMESTAMP_UTC` | PK `(job_id, version)`; FK `job_id → jobs.id`; เนื้อหา immutable หลังสร้าง; `jobs.current_version` ชี้เวอร์ชันที่แสดง/ตรวจ |
| `job_status_history` | `id UUID`, `job_id UUID`, `job_version INTEGER`, `previous_status`, `new_status`, `source_event_id UUID NULL`, `actor_user_id UUID NULL`, `reason TEXT NULL`, `changed_at TIMESTAMP_UTC` | PK `id`; FK job; UNIQUE `source_event_id` เมื่อมีค่า; ใช้ audit การเผยแพร่ การปฏิเสธ และการระงับ |

`POST /v1/jobs` สร้าง `jobs` และ `job_revisions` เวอร์ชัน 1 ใน transaction เดียวกัน `PATCH` เพิ่ม revision ใหม่และอัปเดต `current_version`; ถ้าเคยส่งตรวจให้เปลี่ยน `status = VERIFYING`, ซ่อนงาน และบันทึก `JobEdited` ลง Outbox ใน transaction เดียวกัน งานที่ `SUSPENDED`/`CLOSED` ห้ามแก้หรือส่งตรวจใหม่

เมื่อรับ `JobVerificationCompleted` ให้ update แบบมีเงื่อนไข `current_version = job_version AND status = VERIFYING AND moderation_hold = false` เท่านั้น หากไม่ตรงให้ถือเป็นผลเก่าและไม่เผยแพร่ เมื่อรับ `JobSuspensionRequested` ให้ตั้ง `moderation_hold = true` พร้อม `status = SUSPENDED` ก่อนตอบ `JobTransitionResolved`; ผลตรวจที่มาภายหลังเปลี่ยนกลับไม่ได้

ดัชนีหลัก: `jobs(status, updated_at DESC)` สำหรับ public search (`status = PUBLISHED` เท่านั้น), `jobs(company_id, updated_at DESC)` สำหรับ HR dashboard, `job_revisions(job_id, version)` สำหรับอ่านเวอร์ชันปัจจุบัน; search ข้อความอิสระ `q` ใช้ index ที่ DBMS รองรับเมื่อเลือกเทคโนโลยี

## 4. Verification & Trust DB

| ตาราง | คอลัมน์สำคัญ | Key และข้อบังคับ |
| --- | --- | --- |
| `blacklist_keywords` | `id UUID`, `keyword VARCHAR(160)`, `keyword_normalized VARCHAR(160)`, `category`, `active BOOLEAN`, `created_by_admin_id UUID`, `deactivated_at TIMESTAMP_UTC NULL` | PK `id`; UNIQUE `keyword_normalized`; API DELETE เปลี่ยน `active=false` เพื่อคงประวัติ |
| `risk_policy_versions` | `version INTEGER`, `config JSON`, `activated_at TIMESTAMP_UTC`, `created_by_admin_id UUID` | PK `version`; config ระบุคะแนนของ R-01…T-03 และ Grey Area ที่ใช้ในช่วงนั้น |
| `job_verifications` | `id UUID`, `job_id UUID`, `job_version INTEGER`, `company_id UUID`, `risk_score INTEGER`, `verdict`, `matched_keywords JSON`, `score_reasons JSON`, `policy_version INTEGER`, `tier_snapshot INTEGER`, `on_site_verified_until_snapshot DATE NULL`, `hr_email_type_snapshot`, `verified_at TIMESTAMP_UTC` | PK `id`; UNIQUE `(job_id, job_version)`; FK `policy_version → risk_policy_versions.version`; ผลตรวจหนึ่งชุดต่อเวอร์ชันประกาศ |
| `job_review_cases` | `id UUID`, `verification_id UUID`, `job_id UUID`, `job_version INTEGER`, `status`, `decision NULL`, `reason TEXT NULL`, `admin_user_id UUID NULL`, `decision_event_id UUID NULL`, `decided_at TIMESTAMP_UTC NULL` | PK `id`; FK verification; UNIQUE `(job_id, job_version)`; สถานะ `OPEN`, `DECISION_PENDING`, `APPLIED`, `STALE` |
| `reports` | `id UUID`, `job_id UUID`, `company_id UUID`, `reporter_student_id UUID`, `reason_code`, `description TEXT NULL`, `reported_at TIMESTAMP_UTC` | PK `id`; UNIQUE `(job_id, reporter_student_id)` ป้องกันบัญชีเดิมนับซ้ำ |
| `report_review_cases` | `id UUID`, `job_id UUID`, `company_id UUID`, `report_count_at_open INTEGER`, `status`, `decision NULL`, `reason TEXT NULL`, `admin_user_id UUID NULL`, `decision_event_id UUID NULL` | PK `id`; UNIQUE `job_id` สำหรับเคส Tier 2/On-Site; dismiss แล้ว report ใหม่สามารถเปิดเคสเดิมอีกครั้ง โดยเก็บแต่ละการตัดสินใน `moderation_actions` |
| `moderation_actions` | `id UUID`, `job_id UUID`, `company_id UUID`, `source`, `request_event_id UUID`, `outcome NULL`, `outcome_reason TEXT NULL`, `requested_at TIMESTAMP_UTC`, `resolved_at TIMESTAMP_UTC NULL` | PK `id`; UNIQUE `request_event_id`; บันทึก Auto-Suspend หรือคำสั่ง Admin และผล `JobTransitionResolved` |
| `on_site_verifications` | `id UUID`, `company_id UUID`, `supervisor_user_id UUID`, `visited_on DATE`, `result`, `notes TEXT NULL`, `recorded_at TIMESTAMP_UTC` | PK `id`; PASS จึงส่ง `OnSiteVerificationPassed`; FAIL เก็บผลแต่ไม่ออก badge |

Verification ตรวจงานโดยบันทึก `job_verifications` และ `job_review_cases` (ถ้าคะแนนปานกลาง) พร้อม `JobVerificationCompleted` ใน Outbox transaction เดียวกัน `risk_score` อาจติดลบตามกฎ ไม่ใส่ CHECK ว่าต้อง ≥ 0 คำที่พบและ score reasons ต้องคง snapshot เดิมแม้ blacklist/policy เปลี่ยนภายหลัง

เมื่อมี Report ใหม่ให้ insert `reports` ก่อนนับจำนวนผู้รายงาน; transaction เดียวกันบันทึก `CompanyReportRecorded` ใน Outbox หากครบ 3 คนและเป็น Tier 1 ให้บันทึก `moderation_actions` พร้อม `JobSuspensionRequested`; Tier 2/On-Site เปิด `report_review_cases` แทน การตรวจ Tier ปัจจุบันต้องอ่าน Identity ไม่ใช้ cache อย่างเดียว

ดัชนีหลัก: `job_verifications(job_id, job_version)` UNIQUE, `job_review_cases(status, created_at)`, `reports(job_id, reporter_student_id)` UNIQUE, `reports(company_id, reported_at)`, `report_review_cases(status, created_at)`, `on_site_verifications(company_id, visited_on DESC)`

## 5. Student Experience DB

| ตาราง | คอลัมน์สำคัญ | Key และข้อบังคับ |
| --- | --- | --- |
| `student_profiles` | `student_id UUID`, `university VARCHAR(240)`, `major VARCHAR(240)`, `skills JSON` | PK `student_id`; เป็น User ID จาก Identity ไม่มี FK ข้าม Service |
| `resume_files` | `id UUID`, `student_id UUID`, `storage_key TEXT`, `filename VARCHAR(255)`, `mime VARCHAR(100)`, `size_bytes INTEGER`, `uploaded_at TIMESTAMP_UTC` | PK `id`; index `student_id`; ตรวจเจ้าของก่อนแนบใบสมัคร |
| `applications` | `id UUID`, `job_id UUID`, `company_id UUID`, `student_id UUID`, `resume_id UUID`, `cover_note TEXT NULL`, `status`, `submitted_at TIMESTAMP_UTC`, `decided_at TIMESTAMP_UTC NULL`, `decided_by_hr_id UUID NULL` | PK `id`; FK `resume_id → resume_files.id`; UNIQUE `(job_id, student_id)`; ต้องตรวจ Job ยัง `PUBLISHED` ตอนสมัคร |
| `internships` | `id UUID`, `application_id UUID`, `job_id UUID`, `company_id UUID`, `student_id UUID`, `start_date DATE`, `end_date DATE NULL`, `status`, `assessment_result NULL`, `assessed_by_hr_id UUID NULL`, `assessed_at TIMESTAMP_UTC NULL` | PK `id`; UNIQUE `application_id`; FK `application_id → applications.id`; `start_date` ไม่ก่อนวันที่รับเข้าและแก้ย้อนหลังไม่ได้; `end_date` ไม่ก่อน start และไม่เกินวันนี้ |
| `reviews` | `id UUID`, `internship_id UUID`, `company_id UUID`, `student_id UUID`, `rating INTEGER`, `comment TEXT`, `assessment_result`, `created_at TIMESTAMP_UTC` | PK `id`; UNIQUE `internship_id`; FK internship; CHECK `rating BETWEEN 1 AND 5`; Pass/Fail เป็น snapshot ที่ client แก้ไม่ได้ |
| `certificate_decisions` | `id UUID`, `internship_id UUID`, `supervisor_user_id UUID`, `decision`, `reason TEXT NULL`, `decided_at TIMESTAMP_UTC` | PK `id`; FK internship; เก็บประวัติทั้ง APPROVE/REJECT |
| `certificates` | `id UUID`, `internship_id UUID`, `student_id UUID`, `approved_by_supervisor_id UUID`, `approved_at TIMESTAMP_UTC`, `document_storage_key TEXT`, `issued_at TIMESTAMP_UTC` | PK `id`; UNIQUE `internship_id`; FK internship; ออกได้เฉพาะ Pass และ `end_date - start_date >= 30 วัน` |
| `student_badges` | `id UUID`, `student_id UUID`, `internship_id UUID`, `certificate_id UUID`, `badge_type`, `issued_at TIMESTAMP_UTC` | PK `id`; UNIQUE `(internship_id, badge_type)`; FK certificate; `INTERNSHIP_VERIFIED` ออกพร้อม Certificate |

`assessment_result = FAIL` ไม่ตัดสิทธิ์สร้าง Review เมื่อ Internship เป็น `COMPLETED` การออก Certificate และ Badge ตรวจ `COMPLETED`, `PASS`, วันสิ้นสุดไม่เกินวันนี้ และระยะฝึกอย่างน้อย 30 วันใน transaction เดียวกัน `GET Internship` ประกอบ `certificate_id` จาก `certificates` ซึ่งอาจยังไม่มี

ดัชนีหลัก: `applications(student_id, submitted_at DESC)`, `applications(job_id, submitted_at DESC)`, `internships(company_id, status)`, `reviews(company_id, created_at DESC)`, `certificates(student_id, issued_at DESC)`

## 6. ตารางสนับสนุน Event และ HTTP idempotency

สร้างตารางชุดนี้ **แยกในทุก Service DB** ที่ส่ง/รับ Event หรือรองรับ `Idempotency-Key`:

| ตาราง | คอลัมน์สำคัญ | Key และการใช้งาน |
| --- | --- | --- |
| `outbox_events` | `event_id UUID`, `event_type`, `schema_version INTEGER`, `aggregate_type`, `aggregate_id UUID`, `correlation_id UUID`, `causation_id UUID NULL`, `payload JSON`, `occurred_at TIMESTAMP_UTC`, `published_at TIMESTAMP_UTC NULL`, `attempt_count INTEGER`, `last_error TEXT NULL` | PK `event_id`; publisher อ่านรายการ `published_at IS NULL` และ retry ด้วย Event ID เดิม |
| `processed_events` | `consumer_name`, `event_id UUID`, `processed_at TIMESTAMP_UTC` | PK `(consumer_name, event_id)`; insert พร้อมผลธุรกิจใน transaction เดียวกันเพื่อรับ Event ซ้ำได้ |
| `idempotency_requests` | `actor_id UUID`, `operation_key`, `idempotency_key`, `request_hash`, `response_status INTEGER`, `response_body JSON`, `created_at TIMESTAMP_UTC`, `expires_at TIMESTAMP_UTC` | PK `(actor_id, operation_key, idempotency_key)`; key เดิม + hash เดิมคืนผลเดิม, hash ต่างตอบ `409` |

Outbox และ Inbox เป็นส่วนหนึ่งของ transaction ฐานข้อมูลบริการนั้น ไม่ใช้ shared DB ระหว่าง Service; รหัส Event และ Idempotency-Key เป็นคนละกลไก TTL ของ `idempotency_requests`, retry limit และ Dead Letter Queue กำหนดหลังเลือก Broker และ DBMS

## 7. ข้อบังคับที่ต้องทำใน transaction / service layer

1. **e-KYB:** อนุมัติ submission, เปลี่ยนบริษัทเป็น Tier 1, ป้องกันเลขทะเบียนซ้ำ, เขียน tier history และ Outbox ใน transaction เดียวกัน
2. **Job edit:** เพิ่ม revision, เลื่อน current version, ซ่อนงานเป็น `VERIFYING` และเขียน Outbox ก่อนตอบ `202`; `If-Match` ต้องเทียบเวอร์ชันปัจจุบัน
3. **Job verdict:** ใช้ conditional update ตาม version/status/hold; สร้าง status history และ Outbox `JobPublicationChanged` เมื่อสถานะเปลี่ยน
4. **Third Report:** นับ `reports` ที่ unique ต่อ job หลัง insert แล้วสร้าง moderation action หรือ review case เพียงครั้งเดียว; `JobSuspensionRequested` ส่งซ้ำได้แต่ต้องไม่ปลดระงับ
5. **Internship completion:** ตรวจใบสมัคร `ACCEPTED`, วันเริ่มที่บันทึก, วันสิ้นสุด และผู้ประเมินเป็น HR ของบริษัท; เปลี่ยนเป็น `COMPLETED` พร้อม Outbox `InternshipAssessmentRecorded`
6. **Review:** ตรวจ Internship เป็น `COMPLETED` และ Student เป็นเจ้าของ; unique `internship_id` กันรีวิวซ้ำ โดยไม่ดู Pass/Fail เป็นเงื่อนไขสิทธิ์
7. **Certificate:** ตรวจ `PASS` และระยะอย่างน้อย 30 วัน; บันทึก decision, certificate, badge ใน transaction เดียวกัน; unique `internship_id` ป้องกันออกซ้ำ

## 8. ข้อเปิดก่อนทำ migration จริง

- DBMS, วิธีเก็บไฟล์, เทคนิค search และชนิด JSON จริงยังต้องเลือกตาม stack ของทีม
- PM ต้องยืนยันวิธีนับอนุมัติ 3 ครั้งของ Tier 2 และนโยบายเมื่อบริษัท Tier 2 ถูก Report ใหม่ หลักฐานใน schema รองรับทั้งสองทาง
- วันเริ่มฝึกงานตาม API Contract บันทึกตอน HR รับเข้าและห้ามย้อนหลัง; หากต้องยืนยันวันเริ่มจริงโดยนักศึกษาหรือ Supervisor ต้องเพิ่ม workflow ก่อน implementation
