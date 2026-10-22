# API Contract v1 — University Internship Platform

**สถานะ:** แบบร่างร่วมสำหรับทีม, Week 1<br>
**อ้างอิง:** `docs/architecture.md`, `README.md`, `Verification Rules & Risk Sco.txt`

เอกสารนี้กำหนด HTTP API ผ่าน Gateway สำหรับ Web UI และ API ภายในที่ต้องใช้ข้ามบริการ ยังไม่กำหนดภาษาโปรแกรม, Gateway, Broker หรือฐานข้อมูล การเปลี่ยนชื่อฟิลด์/สถานะหลังเริ่มพัฒนาต้องแก้เอกสารนี้ร่วมกับผู้พัฒนาทุกบริการ

## 1. รูปแบบร่วม

- Base path: `/v1`; ส่งและรับ JSON ด้วย `Content-Type: application/json` ยกเว้น endpoint อัปโหลดและดาวน์โหลดไฟล์
- ชื่อฟิลด์ใช้ `snake_case`; ID เป็น string แบบ UUID; เวลาเป็น ISO 8601 UTC; วันที่เป็น `YYYY-MM-DD` และตีความวันตามเขตเวลา `Asia/Bangkok` สำหรับกฎ 30 วันและอายุป้าย 1 ปี
- Endpoint ที่ต้องล็อกอินใช้ `Authorization: Bearer <access_token>` โดย token มี `sub` (user ID), `role`, `iat`, `exp`; บริการปลายทางต้องตรวจ token และสิทธิ์เจ้าของข้อมูลอีกชั้น
- บัญชี `PLATFORM_ADMIN` และ `SUPERVISOR` ต้องสร้างโดยผู้ดูแลระบบ ไม่มี public sign-up สำหรับสองบทบาทนี้
- คำขอแก้ข้อมูลที่อาจถูกส่งซ้ำ (`submit`, `decision`, `report`, `certificate approval`) รับ `Idempotency-Key` เพื่อคืนผลเดิมเมื่อส่งซ้ำด้วย key เดิมและ body เดิม; key เดิมแต่ body ต่างกันตอบ `409`
- `GET` ที่เป็นรายการตอบ `{ "items": [...], "next_cursor": null }`; รับ `limit` (1–100, ค่าเริ่มต้น 20) และ `cursor`
- รูปแบบ error ทุกบริการ:

```json
{
  "error": {
    "code": "KYB_REQUIRED",
    "message": "บริษัทต้องผ่าน e-KYB ก่อนส่งตรวจประกาศ",
    "details": {},
    "request_id": "b39c1c47-21ab-4133-bc47-1f0c1e1b5abc"
  }
}
```

| HTTP | ความหมายหลัก |
| --- | --- |
| `200`, `201` | สำเร็จ; `201` สำหรับสร้าง resource |
| `202` | รับคำขอแล้วและกำลังประมวลผลแบบ asynchronous; ยังไม่ใช่ผลอนุมัติ |
| `400` | รูปแบบคำขอผิด, `401` ไม่ได้ยืนยันตัวตน, `403` ไม่มีสิทธิ์ |
| `404` | ไม่พบข้อมูลหรือไม่มีสิทธิ์เห็น resource นั้น |
| `409` | สถานะปัจจุบันไม่อนุญาต, ข้อมูลซ้ำ หรือ idempotency key ขัดกัน |
| `412` | `If-Match` เป็นเวอร์ชันเก่า |
| `422` | ข้อมูลไม่ผ่านกฎ validation |
| `503` | บริการที่ต้องพึ่งพายังไม่พร้อม; ห้ามอนุมัติหรือเผยแพร่แทน |

รหัส error ที่ใช้ใน flow สำคัญ: `INVALID_CREDENTIALS`, `FORBIDDEN_ROLE`, `NOT_OWNER`, `KYB_REQUIRED`, `KYB_NOT_APPROVABLE`, `JOB_NOT_PUBLISHED`, `JOB_VERSION_CONFLICT`, `DUPLICATE_REPORT`, `REVIEW_NOT_ELIGIBLE`, `INTERNSHIP_TOO_SHORT`, `DEPENDENCY_UNAVAILABLE`

## 2. สถานะและกฎที่ API ต้องรักษา

| Resource | สถานะที่ส่งออก | ความหมาย |
| --- | --- | --- |
| Company | `tier: 0`, `1`, `2`; `on_site_verified_until` เป็นวันที่หรือ `null` | Tier 2+ แสดงด้วย Tier 2 พร้อมวันหมดอายุ On-Site แบบ exclusive; Badge ใช้ได้เมื่อ `tier = 2` และ `today < on_site_verified_until` ตามเวลาไทย |
| KYB submission | `PENDING_EXTERNAL`, `PENDING_ADMIN`, `VERIFIED`, `REJECTED`, `EXTERNAL_ERROR` | บริษัท Tier 0 จนกว่า Admin จะอนุมัติ |
| Job | `DRAFT`, `VERIFYING`, `PENDING_REVIEW`, `PUBLISHED`, `AUTO_REJECTED`, `REJECTED`, `SUSPENDED`, `CLOSED` | มีเพียง `PUBLISHED` ที่อยู่ใน public search และสมัครได้ |
| Application | `SUBMITTED`, `ACCEPTED`, `REJECTED` | HR เปลี่ยนได้เฉพาะใบสมัครของงานในบริษัทตน |
| Internship | `IN_PROGRESS`, `COMPLETED` | `COMPLETED` เป็นเงื่อนไขเปิดสิทธิ์รีวิว ไม่ขึ้นกับผล Pass/Fail |
| HR assessment | `PASS`, `FAIL` | แสดงกำกับรีวิว; Certificate ออกได้เฉพาะเคส Pass ที่ผ่านเงื่อนไขเวลา |

เมื่อ HR แก้ประกาศที่เคยส่งตรวจแล้ว Job Management เพิ่ม `version`, เปลี่ยนเป็น `VERIFYING`, ซ่อนงานทั้งรายการและส่งตรวจใหม่ `PENDING_REVIEW` ใช้เฉพาะผลคะแนน 20–69 หรือผลที่ Admin รับเข้าคิวตามกฎ ส่วน Report ของ Tier 2 มีคิวสีเหลืองแยกตั้งแต่รายงานแรกและยังคง `PUBLISHED` จน Admin ตัดสิน

Blacklist ใน `job_title` หรือ `description` ทำให้ `AUTO_REJECTED` ก่อนพิจารณาช่วงคะแนน หากไม่พบ Blacklist: คะแนน `< 20` → `PUBLISHED`, `20–69` → `PENDING_REVIEW`, `≥ 70` → `AUTO_REJECTED` ทั้ง Tier 1 และ Tier 2 ใช้ช่วงคะแนนเดียวกัน

## 3. Identity & Company KYB Service

Gateway ส่ง route `/v1/auth/*`, `/v1/me`, `/v1/companies/*` และ `/v1/admin/kyb-submissions/*` ไปบริการนี้

| Method + path | ผู้เรียก | Request | Success |
| --- | --- | --- | --- |
| `POST /v1/auth/students/register` | Public | `email`, `password`, `display_name` | `201` `User`; รับเฉพาะอีเมลลงท้าย `.ac.th` |
| `POST /v1/auth/companies/register` | Public | `email`, `password`, `display_name`, `company_name` | `201` `{ user, company }`; สร้าง HR และ Tier 0 |
| `POST /v1/auth/login` | Public | `email`, `password` | `200` `{ access_token, token_type: "Bearer", expires_in, user }` |
| `GET /v1/me` | ทุกบทบาท | — | `200` `User`; HR ได้ `company_id` ที่ระบบผูกไว้ |
| `GET /v1/companies/me` | `COMPANY_HR` | — | `200` `Company` |
| `POST /v1/companies/me/kyb-submissions` | `COMPANY_HR` | `multipart/form-data`: `registration_number`, `document` | `202` `KybSubmission`; สถานะเริ่ม `PENDING_EXTERNAL` |
| `GET /v1/companies/me/kyb-submissions/{submission_id}` | HR เจ้าของบริษัท | — | `200` `KybSubmission` |
| `GET /v1/admin/kyb-submissions?status=PENDING_ADMIN` | `PLATFORM_ADMIN` | filter + pagination | `200` รายการ `KybSubmission` |
| `POST /v1/admin/kyb-submissions/{submission_id}/decision` | `PLATFORM_ADMIN` | `decision: APPROVE\|REJECT`, `reason` เมื่อ reject | `200` `KybSubmission`; approve แล้วบริษัทเป็น Tier 1 |

`registration_number` เป็นสตริงตัวเลข 13 หลัก เก็บเลขศูนย์นำหน้าได้; ไฟล์เอกสารต้องจำกัดประเภทและขนาดใน implementation และไม่ส่งไฟล์หรือเลขทะเบียนเต็มผ่าน Event/Log การเรียก e-KYB Mock หรือ 3rd Party อยู่หลัง Identity เท่านั้น ผลภายนอกเป็นข้อมูลประกอบการตัดสินของ Admin ไม่เลื่อน Tier อัตโนมัติ

ตัวอย่าง `Company` และ `KybSubmission` ที่ส่งให้ผู้มีสิทธิ์:

`User` ที่ส่งกลับจาก register/login/me มีฟิลด์ `id`, `email`, `display_name`, `role`, `company_id` (`null` สำหรับผู้ที่ไม่ใช่ HR) และ `created_at`; ไม่ส่ง password หรือ password hash

```json
{
  "id": "e5581fd8-9d1b-4320-afce-386ecba3be2d",
  "name": "Example Co., Ltd.",
  "kyb_status": "VERIFIED",
  "tier": 1,
  "on_site_verified_until": null
}
```

```json
{
  "id": "0cd3f28f-9991-4c75-b51a-6e2baec1651f",
  "company_id": "e5581fd8-9d1b-4320-afce-386ecba3be2d",
  "status": "PENDING_ADMIN",
  "provider_result": "MATCHED",
  "submitted_at": "2026-10-22T08:00:00Z",
  "decided_at": null
}
```

## 4. Job Management Service

Gateway ส่ง `/v1/jobs` (ยกเว้น subpath `/reports` และ `/applications`) ไปบริการนี้

| Method + path | ผู้เรียก | Request | Success |
| --- | --- | --- | --- |
| `GET /v1/jobs` | Public | `category`, `q`, pagination | `200` เฉพาะ Job ที่ `PUBLISHED` |
| `GET /v1/jobs/{job_id}` | Public / HR เจ้าของ | — | `200` Job; คนทั่วไปเห็นเฉพาะ `PUBLISHED` |
| `GET /v1/companies/me/jobs` | `COMPANY_HR` | `status`, pagination | `200` งานทั้งหมดของบริษัทตน |
| `POST /v1/jobs` | `COMPANY_HR` | `job_title`, `description`, `category`, `benefits`, `allowance` | `201` Job สถานะ `DRAFT` |
| `PATCH /v1/jobs/{job_id}` | HR เจ้าของ | ฟิลด์ประกาศที่แก้; `If-Match: "<version>"` | `200` Job ถ้าเป็น Draft; `202` Job สถานะ `VERIFYING` ถ้าเคยส่งตรวจ |
| `POST /v1/jobs/{job_id}/submit` | HR เจ้าของ | `Idempotency-Key` | `202` Job สถานะ `VERIFYING`; Tier 0 ได้ `403 KYB_REQUIRED` |
| `POST /v1/jobs/{job_id}/close` | HR เจ้าของ | `Idempotency-Key` | `200` Job สถานะ `CLOSED` |

ฟิลด์ Job ขั้นต่ำ:

```json
{
  "id": "35dc16dd-8b03-40fd-8111-93f03af828c4",
  "company_id": "e5581fd8-9d1b-4320-afce-386ecba3be2d",
  "job_title": "Software Engineer Intern",
  "description": "รายละเอียดงานและสิ่งที่จะได้เรียนรู้...",
  "category": "TECH_IT",
  "benefits": ["มีพี่เลี้ยง"],
  "allowance": { "amount": 300, "currency": "THB", "period": "DAY" },
  "status": "VERIFYING",
  "version": 2,
  "risk_score": null,
  "created_at": "2026-10-22T08:00:00Z",
  "updated_at": "2026-10-22T09:00:00Z"
}
```

`category` ใช้ `TECH_IT`, `BUSINESS_MARKETING`, `CORPORATE_SERVICES`; `benefits` เป็น array ซึ่งอาจว่าง และ `allowance` เป็น object หรือ `null` เพื่อให้ R-03 ตรวจได้แน่นอน `risk_score` เป็นคะแนนล่าสุดที่ตรวจเสร็จหรือ `null` ขณะ `VERIFYING`; ไม่รับ `status`, `company_id`, `risk_score`, `version` จาก client ในคำขอสร้าง/แก้

`submit` ใช้กับ `DRAFT` เท่านั้น; งานที่ `SUSPENDED` หรือ `CLOSED` แก้หรือส่งตรวจใหม่ไม่ได้ (`409`) งานที่ `PENDING_REVIEW`, `PUBLISHED`, `AUTO_REJECTED` หรือ `REJECTED` แก้ไขได้แล้วเข้าสู่ `VERIFYING` เพื่อคัดกรองเนื้อหาปัจจุบัน หากแก้ระหว่าง `VERIFYING` ต้องเพิ่ม `version` และไม่ใช้ผลตรวจของเลขเดิม `version` เป็นเลขลำดับภายในสำหรับ concurrency และผลตรวจที่มาช้า ไม่ใช่ระบบเก็บหรือแสดงเนื้อหาเก่า

Job Management ตรวจสถานะ e-KYB และความเป็นเจ้าของกับ Identity ก่อน `submit` และก่อนเปลี่ยนงานที่เคยเผยแพร่ เมื่อแก้งาน `PUBLISHED` ต้องแทนที่เนื้อหา ตั้งสถานะ `VERIFYING` และซ่อนจาก public search/detail ใน transaction เดียวกันก่อนส่งตรวจ Blacklist และ Risk Score ใหม่ ห้ามแสดงเนื้อหาเก่าระหว่างรอตรวจ หาก Identity/Broker ไม่พร้อมให้คงสถานะซ่อนและตอบ `503` หรือรับ `202` พร้อม retry ที่เชื่อถือได้ ห้ามคืน `PUBLISHED` โดยปริยาย

## 5. Verification & Trust Service

Gateway ส่ง `/v1/jobs/{job_id}/reports`, `/v1/admin/job-reviews/*`, `/v1/admin/report-reviews/*`, `/v1/admin/blacklist-keywords/*` และ `/v1/companies/{company_id}/on-site-verifications` ไปบริการนี้

| Method + path | ผู้เรียก | Request | Success |
| --- | --- | --- | --- |
| `GET /v1/admin/job-reviews` | `PLATFORM_ADMIN` | `status=OPEN`, pagination | `200` คิวงานคะแนนปานกลาง พร้อมคะแนนและเหตุผล |
| `GET /v1/admin/job-reviews/{review_id}` | `PLATFORM_ADMIN` | — | `200` ผลตรวจและสถานะ `OPEN\|DECISION_PENDING\|APPLIED\|STALE` |
| `POST /v1/admin/job-reviews/{review_id}/decision` | `PLATFORM_ADMIN` | `decision: APPROVE\|REJECT`, `reason` เมื่อ reject | `202` รับผลตัดสินเพื่อส่งให้ Job Management |
| `POST /v1/jobs/{job_id}/reports` | `STUDENT` | `reason_code`, `description` | `201` `{ report_id, status }`; นักศึกษา 1 คนรายงานงานเดิมได้ครั้งเดียว |
| `GET /v1/admin/report-reviews` | `PLATFORM_ADMIN` | `status=OPEN`, pagination | `200` เคส Tier 1 หลังครบ 3 บัญชี และคิวสีเหลืองของ Tier 2/On-Site ตั้งแต่ Report แรก |
| `GET /v1/admin/report-reviews/{review_id}` | `PLATFORM_ADMIN` | — | `200` ผลตรวจ Report และสถานะการตัดสินล่าสุด |
| `POST /v1/admin/report-reviews/{review_id}/decision` | `PLATFORM_ADMIN` | `decision: CONFIRM\|DISMISS`, `reason`; เมื่อ CONFIRM ระบุ `suspend_job: boolean` | `202` รับผลตัดสิน; CONFIRM ส่งหลักฐานให้ Identity ลด Tier 2 และส่งคำสั่งระงับงานเมื่อ `suspend_job=true` |
| `GET /v1/admin/blacklist-keywords` | `PLATFORM_ADMIN` | pagination | `200` รายการคำต้องห้าม |
| `POST /v1/admin/blacklist-keywords` | `PLATFORM_ADMIN` | `keyword`, `category` | `201` keyword |
| `DELETE /v1/admin/blacklist-keywords/{keyword_id}` | `PLATFORM_ADMIN` | — | `204` |
| `POST /v1/companies/{company_id}/on-site-verifications` | `SUPERVISOR` | `visited_on`, `result: PASS\|FAIL`, `notes` | `201` ผลตรวจ; PASS ส่งผลให้ Identity ตั้งวันหมดอายุ |

`reason_code` ของ Report ใช้ `SCAM`, `MISREPRESENTATION`, `OTHER`; `description` อาจว่างได้ เฉพาะงาน `PUBLISHED` ที่นักศึกษาเข้าถึงได้จึงรายงานได้ งาน Tier 1 ถูกซ่อนเป็น `SUSPENDED` และเปิดเคสให้ Admin ตรวจเมื่อครบ 3 **บัญชีนักศึกษาที่ไม่ซ้ำกัน** ส่วน Tier 2/On-Site เพิ่มคิวสีเหลืองตั้งแต่ Report แรกโดยยังไม่ Auto-Suspend และไม่ลด Tier จนกว่า Admin จะ CONFIRM รายงานว่ามีมูล; DISMISS ไม่ตัดสิทธิ์ Tier 2

การยืนยัน On-Site ใช้กับบริษัทที่ผ่าน e-KYB และเป็น Tier 2 แล้วเท่านั้น; ผล PASS จึงเปิดป้าย Tier 2+ ตามอายุที่กำหนด

ผลตรวจงานที่ Admin เห็นต้องมี `job_id`, `job_version`, `risk_score`, `matched_keywords`, `score_reasons`, `status` การตัดสินต้องอ้าง `job_version` ปัจจุบัน หากงานถูกแก้ก่อน Admin ตัดสิน ให้ตอบ `409 JOB_VERSION_CONFLICT` เพื่อไม่อนุมัติเนื้อหาเก่า

## 6. Student Experience Service

Gateway ส่ง `/v1/students/me/*`, `/v1/jobs/{job_id}/applications`, `/v1/applications/*`, `/v1/internships/*` และ `/v1/companies/{company_id}/reviews` ไปบริการนี้

| Method + path | ผู้เรียก | Request | Success |
| --- | --- | --- | --- |
| `GET /v1/students/me/profile` | `STUDENT` | — | `200` profile, badge และ certificate IDs |
| `PUT /v1/students/me/profile` | `STUDENT` | `university`, `major`, `skills` | `200` profile; `display_name` อ้างจาก Identity |
| `POST /v1/students/me/resume` | `STUDENT` | `multipart/form-data`: `document` | `201` `{ resume_id, filename }` |
| `POST /v1/jobs/{job_id}/applications` | `STUDENT` | `resume_id`, `cover_note` | `201` Application; งานต้อง `PUBLISHED` |
| `GET /v1/applications/me` | `STUDENT` | pagination | `200` ใบสมัครของตน |
| `GET /v1/jobs/{job_id}/applications` | HR เจ้าของงาน | pagination | `200` ใบสมัครของงานนั้น |
| `POST /v1/applications/{application_id}/decision` | HR เจ้าของงาน | `decision: ACCEPT\|REJECT`; เมื่อ ACCEPT ส่ง `start_date` | `200` Application; ACCEPT สร้าง Internship |
| `POST /v1/internships/{internship_id}/assessment` | HR บริษัทผู้รับฝึก | `result: PASS\|FAIL`, `end_date` | `200` Internship สถานะ `COMPLETED` |
| `POST /v1/companies/{company_id}/reviews` | `STUDENT` ผู้ฝึกจริง | `internship_id`, `rating` (1–5), `comment` | `201` Review พร้อม `assessment_result` |
| `POST /v1/internships/{internship_id}/certificate-approval` | `SUPERVISOR` | `decision: APPROVE\|REJECT`, `reason` เมื่อ reject | `200` ผลอนุมัติ; APPROVE สร้าง E-Certificate และ Badge |
| `GET /v1/internships/{internship_id}/certificate` | Student เจ้าของ / Supervisor | — | `200` PDF เฉพาะใบที่อนุมัติแล้ว |

เมื่อ HR รับใบสมัคร Student Experience สร้าง Internship และบันทึก `start_date` ซึ่งต้องไม่ก่อนวันที่รับเข้าและแก้ย้อนหลังไม่ได้ `assessment` รับเฉพาะ `end_date` ที่ไม่เกินวันปัจจุบันและไม่ก่อน `start_date` รีวิวเปิดเมื่อ Internship เป็น `COMPLETED` ไม่ว่า `assessment_result` จะ `PASS` หรือ `FAIL` และ 1 Internship รีวิวได้ครั้งเดียว

Supervisor อนุมัติ Certificate ได้เฉพาะ Internship `COMPLETED` ที่ผล `PASS` และระยะ `end_date - start_date >= 30 วัน` ตรวจซ้ำที่ server แม้ UI จะปิดปุ่ม หากยังไม่ครบตอบ `409 INTERNSHIP_TOO_SHORT`

ฟิลด์ response ขั้นต่ำของ resource ฝั่งนักศึกษา:

| Resource | ฟิลด์ |
| --- | --- |
| Application | `id`, `job_id`, `student_id`, `resume_id`, `status`, `cover_note`, `submitted_at`, `decided_at` |
| Internship | `id`, `application_id`, `student_id`, `company_id`, `start_date`, `end_date`, `status`, `assessment_result`, `certificate_id` |
| Review | `id`, `internship_id`, `company_id`, `student_id`, `rating`, `comment`, `assessment_result`, `created_at` |

`end_date`, `assessment_result`, `certificate_id` เป็น `null` ได้ก่อนเกิดขั้นตอนนั้น `assessment_result` ใน Review เป็น snapshot จาก Internship ที่ใช้แสดงป้าย Pass/Fail และแก้โดย client ไม่ได้

## 7. Internal API และความสัมพันธ์กับ Event

Internal API ใช้เฉพาะ service-to-service authentication ไม่เปิดผ่าน Gateway และไม่รับสิทธิ์จาก header ที่ Web UI กำหนดเอง

| Method + path | เจ้าของ → ผู้ใช้ | Response สำคัญ |
| --- | --- | --- |
| `GET /internal/v1/companies/{company_id}/hr-users/{user_id}/posting-context` | Identity → Job, Verification | `is_company_hr`, `kyb_status`, `tier`, `on_site_verified_until`, `hr_email_type: FREE\|CORPORATE\|OTHER` |
| `GET /internal/v1/jobs/{job_id}/publication-context` | Job → Verification, Student | `company_id`, `status`, `version`; ใช้เช็กว่างานยังเผยแพร่และผูกกับบริษัทใด |
| `GET /internal/v1/internships/{internship_id}/trust-outcome` | Student → Identity | `company_id`, `assessment_result`, `status`; ใช้ตรวจเงื่อนไขเลื่อน Tier |
| `GET /internal/v1/companies/{company_id}/report-history` | Verification → Identity | `has_confirmed_report: boolean`; Identity ตรวจข้อมูลปัจจุบันก่อนเลื่อน Tier 2 โดยไม่นับ Report ที่ยังไม่ยืนยันหรือถูกยกคำร้อง |

การตรวจประกาศใช้ Event `JobSubmitted`/`JobEdited` และ `JobVerificationCompleted` ตามสถาปัตยกรรม การอนุมัติ Admin, Report, ผลฝึกงาน และ On-Site ส่งผลข้ามบริการตาม `docs/event-contract.md`; API นี้ไม่ถือว่า `202` คือการอัปเดตข้ามบริการเสร็จแล้ว

## 8. ประเด็นที่ต้องยืนยันก่อน implementation

1. การจัดเก็บไฟล์ KYB/Resume/Certificate และขนาดไฟล์สูงสุด
2. ระยะเวลา access token และวิธี provisioning บัญชี Admin/Supervisor
3. การยืนยันวันเริ่มฝึกงานจริงหลังรับเข้า; ข้อตกลงปัจจุบันคือบันทึกวันที่เริ่มเมื่อ HR รับนักศึกษา โดยห้ามกรอกวันย้อนหลัง

การยืนยันประเด็นเหล่านี้ไม่เปลี่ยนกฎ Risk Score, การบังคับตรวจใหม่หลังแก้ประกาศ, การอนุญาตให้ผู้ที่ Fail รีวิว หรือเกณฑ์ Certificate อย่างน้อย 30 วัน

แบบตารางและข้อบังคับข้อมูลที่รองรับ API นี้อยู่ใน `docs/database-schema.md`
