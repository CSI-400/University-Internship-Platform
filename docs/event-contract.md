# Event Payload Contract v1 — University Internship Platform

**สถานะ:** แบบร่างสัญญา Event v1 สำหรับทีม ปรับเมื่อข้อตกลง Event เปลี่ยน<br>
**ลำดับอ่าน:** [สารบัญเอกสาร](README.md) → [API Contract](api-contract.md) → เอกสารนี้ → [Database Schema](database-schema.md)<br>
**อ้างอิง:** [System Architecture](architecture.md), [API Contract](api-contract.md), [Verification Rules & Risk Score](<../Verification Rules & Risk Sco.txt>)

เอกสารนี้กำหนดเหตุการณ์ที่ 4 Microservices แลกเปลี่ยนผ่าน RabbitMQ คำว่า `v1` ในที่นี้คือเวอร์ชัน schema ของ Event แยกจาก `/v1` ของ HTTP API

## 1. รูปแบบ Event กลาง

ทุกข้อความเป็น UTF-8 JSON มี envelope เดียวกัน:

```json
{
  "event_id": "278b71d7-2754-4e4e-bcb6-95432d909764",
  "event_type": "JobSubmitted",
  "schema_version": 1,
  "occurred_at": "2026-10-22T08:00:00Z",
  "producer": "job-management",
  "aggregate_type": "job",
  "aggregate_id": "35dc16dd-8b03-40fd-8111-93f03af828c4",
  "correlation_id": "d489d8bb-6697-40fd-8a7d-b5dbf5ee2982",
  "causation_id": null,
  "payload": {}
}
```

| ฟิลด์ | กฎ |
| --- | --- |
| `event_id` | UUID ใหม่ต่อเหตุการณ์หนึ่งครั้ง; retry ต้องใช้ ID เดิม |
| `event_type`, `schema_version` | ชื่อ Event แบบ PascalCase และเลขเวอร์ชัน schema; Consumer ปฏิเสธเวอร์ชันที่ไม่รองรับ |
| `occurred_at` | เวลาเกิดเหตุการณ์จากบริการต้นทาง เป็น ISO 8601 UTC |
| `producer` | `identity`, `job-management`, `verification-trust`, `student-experience` |
| `aggregate_type`, `aggregate_id` | สิ่งที่เปลี่ยน เช่น `job`, `company`, `internship`; ใช้ระบุ aggregate เพื่อเทียบสถานะ/เวอร์ชันเมื่อ Event มาผิดลำดับ โดยไม่สมมติว่า RabbitMQ รับประกันลำดับข้าม queue |
| `correlation_id` | ID ของคำขอหรือ workflow ต้นทาง ส่งต่อค่าเดิมตลอดสาย |
| `causation_id` | `event_id` ของเหตุการณ์ที่ทำให้เกิด Event นี้; `null` สำหรับ Event จาก HTTP request โดยตรง |
| `payload` | เนื้อหาเฉพาะ Event ตามตารางด้านล่าง; ใช้ `snake_case` และ UUID string |

วันที่ธุรกิจเป็น `YYYY-MM-DD` ตาม `Asia/Bangkok` ส่วน timestamp ใน envelope เป็น UTC ไม่ส่ง password, token, เอกสาร KYB, Resume, เลขทะเบียนเต็ม หรือข้อมูลนักศึกษาที่ไม่จำเป็นใน Event

## 2. รายการ Event และเส้นทาง

ค่า Routing ด้านล่างใช้เป็น RabbitMQ routing key บน topic exchange `internship.events.v1` Consumer แต่ละบริการใช้ queue ของตนเอง ไม่ให้บริการสองตัวแย่งอ่านข้อความที่อีกตัวต้องได้รับ

| Event (`schema_version: 1`) | Routing | Producer → Consumer | จุดที่ส่ง |
| --- | --- | --- | --- |
| `JobSubmitted` | `jobs.submitted` | Job Management → Verification & Trust | HR ส่ง `DRAFT` เข้าตรวจ |
| `JobEdited` | `jobs.edited` | Job Management → Verification & Trust | HR แก้งานที่เคยส่งตรวจ |
| `JobVerificationCompleted` | `jobs.verification-completed` | Verification & Trust → Job Management | ตรวจ Blacklist และ Risk Score เสร็จ |
| `JobReviewDecided` | `jobs.review-decided` | Verification & Trust → Job Management | Admin ตัดสินงาน `PENDING_REVIEW` |
| `JobSuspensionRequested` | `jobs.suspension-requested` | Verification & Trust → Job Management | Report ครบเกณฑ์สำหรับ Tier 1 หรือ Admin สั่งระงับ |
| `JobTransitionResolved` | `jobs.transition-resolved` | Job Management → Verification & Trust | ยืนยันว่าใช้หรือปฏิเสธ `JobReviewDecided`/`JobSuspensionRequested` |
| `JobPublicationChanged` | `jobs.publication-changed` | Job Management → Identity, Verification & Trust | สถานะประกาศเปลี่ยนหลังตรวจ/ตัดสิน/ระงับ/ปิด |
| `CompanyReportConfirmed` | `companies.report-confirmed` | Verification & Trust → Identity | Admin ยืนยันว่า Report มีมูล; ใช้ตัดสิทธิ์ Tier 2 |
| `InternshipAssessmentRecorded` | `internships.assessment-recorded` | Student Experience → Identity | HR ประเมินการฝึกงานจบเป็น Pass/Fail |
| `OnSiteVerificationPassed` | `companies.on-site-passed` | Verification & Trust → Identity | Supervisor ลงพื้นที่และยืนยันผ่าน |
| `CompanyTrustChanged` | `companies.trust-changed` | Identity → Job Management, Verification & Trust | KYB/Tier/On-Site expiry เปลี่ยน; ใช้อัปเดตการแสดงผลเท่านั้น |

สำหรับเดโมให้สร้าง exchange และ queue แบบ durable โดยผูก routing key ตามผู้รับ:

| Queue | Binding keys |
| --- | --- |
| `identity.events.v1` | `jobs.publication-changed`, `companies.report-confirmed`, `internships.assessment-recorded`, `companies.on-site-passed` |
| `job-management.events.v1` | `jobs.verification-completed`, `jobs.review-decided`, `jobs.suspension-requested`, `companies.trust-changed` |
| `verification-trust.events.v1` | `jobs.submitted`, `jobs.edited`, `jobs.transition-resolved`, `jobs.publication-changed`, `companies.trust-changed` |

Student Experience ส่ง `InternshipAssessmentRecorded` แต่ไม่มี Event ที่ต้องรับใน v1 จึงยังไม่ต้องมี consumer queue; publisher ใช้ persistent message, ตั้ง `mandatory` และตรวจ returned message กรณีไม่มี queue รับ พร้อมรอ publisher confirm ก่อนทำเครื่องหมาย Outbox ว่าส่งแล้ว Consumer ACK หลัง transaction ที่อัปเดตข้อมูลและ `processed_events` สำเร็จเท่านั้น

Identity และ Verification ต้องอ่าน posting context ปัจจุบันผ่าน Internal API ตอนส่งตรวจและคำนวณคะแนน `CompanyTrustChanged` อาจมาช้าหรือสลับลำดับ จึงใช้ cache จาก Event เป็นแหล่งตัดสินสิทธิ์หรือ Risk Score โดยลำพังไม่ได้

## 3. Payload การตรวจประกาศ

### `JobSubmitted` และ `JobEdited`

ทั้งสอง Event ใช้ payload เดียวกันและส่ง **snapshot ของเนื้อหาปัจจุบัน** เพื่อให้ Verification ตรวจโดยไม่ต้องประกอบข้อมูลจากหลาย Event:

```json
{
  "job_id": "35dc16dd-8b03-40fd-8111-93f03af828c4",
  "job_version": 2,
  "company_id": "e5581fd8-9d1b-4320-afce-386ecba3be2d",
  "hr_user_id": "fb77908b-8858-47c0-a705-1587865cc371",
  "job_title": "Software Engineer Intern",
  "description": "รายละเอียดงานและสิ่งที่จะได้เรียนรู้...",
  "category": "TECH_IT",
  "benefits": ["มีพี่เลี้ยง"],
  "allowance": { "amount": 300, "currency": "THB", "period": "DAY" }
}
```

`job_version` เป็นจำนวนเต็มบวกที่ Job Management เพิ่มเมื่อแก้เนื้อหา ใช้แยกผลตรวจที่มาช้า ไม่ใช่ระบบเก็บ/แสดงเนื้อหาเก่า; `JobSubmitted` คือการส่งตรวจครั้งแรก `JobEdited` คือการแก้หลังเคยส่งตรวจแล้ว Job Management ต้องแทนที่เนื้อหาปัจจุบัน บันทึก `VERIFYING` และซ่อนประกาศก่อนส่ง Event ตามลำดับธุรกรรมที่รับประกันด้วย Outbox

### `JobVerificationCompleted`

```json
{
  "job_id": "35dc16dd-8b03-40fd-8111-93f03af828c4",
  "job_version": 2,
  "company_id": "e5581fd8-9d1b-4320-afce-386ecba3be2d",
  "verdict": "PENDING_REVIEW",
  "risk_score": 30,
  "matched_keywords": [],
  "score_reasons": [
    { "rule_code": "R-01", "delta": 30 }
  ],
  "review_id": "ee13b1b2-15ac-44a0-95c4-ed18bff76047"
}
```

`verdict` ใช้ `PUBLISHED`, `PENDING_REVIEW`, `AUTO_REJECTED` เท่านั้น; `review_id` ต้องมีเมื่อ `PENDING_REVIEW` และเป็น `null` ในกรณีอื่น `risk_score` เป็นจำนวนเต็มที่รวม rule impacts; Blacklist สามารถบังคับ `AUTO_REJECTED` แม้คะแนนต่ำกว่า 70 โดยบันทึกคำที่พบใน `matched_keywords` และยังคำนวณคะแนนเพื่อการตรวจสอบย้อนหลัง

Job Management ใช้ Event นี้เมื่อ `job_version` ตรงเวอร์ชันล่าสุดและงานยังเป็น `VERIFYING` เท่านั้น ผลเก่าหรือผลที่มาหลัง `SUSPENDED`/`CLOSED` ต้องไม่ทำให้งานกลับไป `PUBLISHED`

## 4. Payload การตัดสินและการระงับ

| Event | ฟิลด์ payload ที่ต้องมี | กฎการใช้ |
| --- | --- | --- |
| `JobReviewDecided` | `review_id: UUID`, `job_id: UUID`, `job_version: integer`, `decision: APPROVE\|REJECT`, `admin_user_id: UUID`, `reason: string\|null` | Job Management ใช้ได้เฉพาะงานเวอร์ชันเดียวกันที่ยัง `PENDING_REVIEW`; approve → `PUBLISHED`, reject → `REJECTED` |
| `JobSuspensionRequested` | `job_id: UUID`, `company_id: UUID`, `source: REPORT_THRESHOLD\|ADMIN_DECISION`, `report_review_id: UUID\|null`, `report_count: integer` | Job Management ระงับงานปัจจุบันทั้งรายการ ไม่อิง `job_version`; งานที่ถูกระงับต้องไม่ถูกผลตรวจเก่าตีพิมพ์ซ้ำ |
| `JobTransitionResolved` | `request_event_id: UUID`, `job_id: UUID`, `outcome: APPLIED\|REJECTED`, `current_status: JobStatus`, `current_job_version: integer`, `reason: string\|null` | Job Management ส่งกลับทุกครั้งหลังรับ `JobReviewDecided` หรือ `JobSuspensionRequested`; Verification ใช้ปิด/เปิดคิวให้ตรงสถานะจริง |
| `JobPublicationChanged` | `job_id: UUID`, `job_version: integer`, `company_id: UUID`, `previous_status: JobStatus`, `new_status: JobStatus`, `approval_method: AUTO\|ADMIN\|null` | ส่งเมื่อสถานะจริงเปลี่ยน; Identity นับ `job_id` ที่เข้าสู่ `PUBLISHED` ครั้งแรกเพียงครั้งเดียว ทั้ง AUTO และ ADMIN; การเผยแพร่ซ้ำงานเดิมไม่นับเพิ่ม |

`JobSuspensionRequested` มีลำดับความสำคัญเหนือผลการตรวจที่ยังไม่เสร็จ: Job Management ตั้ง moderation hold และ `SUSPENDED` แบบ idempotent หากงาน `CLOSED` แล้วให้ `JobTransitionResolved.outcome = REJECTED` โดยไม่เปิดงานใหม่ การยกเลิก hold ต้องเป็นการตัดสินของ Admin ใน workflow ที่กำหนดเพิ่ม ไม่อนุญาตให้ HR แก้หรือ submit เพื่อเลี่ยงการระงับ

เมื่อ `JobReviewDecided` อ้างเวอร์ชันเก่า Job Management ตอบ `JobTransitionResolved` ด้วย `REJECTED` และ `reason: "STALE_JOB_VERSION"`; Verification ต้องไม่แสดงว่าอนุมัติสำเร็จ แม้ HTTP endpoint สำหรับ Admin เคยตอบ `202` แล้ว

## 5. Payload ความน่าเชื่อถือบริษัท

| Event | ฟิลด์ payload ที่ต้องมี | Consumer ทำอะไร |
| --- | --- | --- |
| `CompanyReportConfirmed` | `report_review_id: UUID`, `job_id: UUID`, `company_id: UUID`, `confirmed_at: timestamp`, `admin_user_id: UUID` | Identity บันทึกหลักฐานที่ Admin ยืนยันว่ามีมูลและลด Tier 2 เป็น Tier 1; ไม่ออก Event นี้เมื่อ DISMISS |
| `InternshipAssessmentRecorded` | `internship_id: UUID`, `company_id: UUID`, `assessment_result: PASS\|FAIL`, `start_date: date`, `end_date: date` | Identity ใช้ผล Pass สำหรับเงื่อนไข Tier 2; นับ `internship_id` ไม่ซ้ำ |
| `OnSiteVerificationPassed` | `verification_id: UUID`, `company_id: UUID`, `visited_on: date`, `supervisor_user_id: UUID` | Identity กำหนด `on_site_verified_until` เป็นวันหมดอายุแบบ exclusive ที่ครบ 1 ปีปฏิทินจาก `visited_on` และเผยแพร่ Trust Change |
| `CompanyTrustChanged` | `company_id: UUID`, `tier: 0\|1\|2`, `kyb_status: string`, `on_site_verified_until: date\|null`, `reason: KYB_APPROVED\|TIER_2_GRANTED\|ONSITE_PASSED\|ONSITE_EXPIRED\|CONFIRMED_REPORT` | Consumer อัปเดตข้อมูลแสดงผล; ต้องอ่าน Identity อีกครั้งเมื่อต้องตัดสินสิทธิ์ |

Verification เก็บ Report ใหม่จากผู้รายงานที่ไม่ซ้ำกันในฐานข้อมูลของตน Tier 2/On-Site เข้าคิวสีเหลืองตั้งแต่ Report แรกโดยไม่ลด Tier อัตโนมัติ `CompanyReportConfirmed` ออกครั้งเดียวต่อการยืนยันของ Admin และเป็นหลักฐานที่ตัดสิทธิ์ Tier 2; Identity ลด Tier 2 เป็น Tier 1 และถ้ามี On-Site Badge ให้หยุดแสดง Badge เพราะ Tier 2+ ต้องมี Tier 2 ก่อน ก่อนเลื่อน Tier 2 Identity ต้องอ่าน `GET /internal/v1/companies/{company_id}/report-history` จาก Verification เพื่อป้องกันการเลื่อนขั้นระหว่างที่ Event ยังส่งมาไม่ถึง หาก Verification ไม่พร้อมให้คง Tier เดิมไว้

`OnSiteVerificationPassed` ใช้เปิดป้ายเฉพาะบริษัทที่ผ่าน e-KYB และเป็น Tier 2; Identity ต้องตรวจสถานะปัจจุบันก่อนบันทึกวันหมดอายุ

## 6. การส่งซ้ำ ลำดับ และกรณีล้มเหลว

1. **Persist + publish:** Producer ใช้ Prisma transaction บันทึกข้อมูลธุรกิจและ outbox record ใน PostgreSQL database ของตน แล้ว publisher ส่งจาก Outbox ไป RabbitMQ ภายหลัง commit; HTTP `202` หมายถึงบันทึกงานและ Outbox สำเร็จ ไม่จำเป็นต้องรอ Consumer
2. **At-least-once:** RabbitMQ อาจส่ง Event ซ้ำ Consumer เก็บ `event_id` ที่ประมวลผลแล้วใน inbox/processed-events และอัปเดตข้อมูลกับ inbox ใน Prisma transaction เดียวกัน
3. **Ordering:** ไม่สมมติว่าทุก Event ทั้งระบบเรียงลำดับ; ผลตรวจประกาศต้องเทียบ `job_version`, ผล On-Site ต้องเทียบวันที่และสถานะปัจจุบัน, การเลื่อน Tier ต้องนับ ID ต้นทางไม่ซ้ำ
4. **Retry:** เมื่อ consumer พบความผิดพลาดชั่วคราว ให้ส่งข้อความเดิม (`event_id` เดิม) ไป durable retry queue พร้อม publisher confirm แล้ว ACK ข้อความเดิม; ใช้ TTL + dead-letter exchange ส่งกลับคิวหลักหลัง 5, 30 และ 120 วินาทีตามลำดับ รวม retry ได้ 3 ครั้ง หลังจากนั้นส่ง per-service DLQ พร้อมจำนวนครั้งและเหตุผล ห้าม requeue ทันทีแบบวนไม่สิ้นสุด
5. **Invalid schema:** Consumer ไม่เปลี่ยนสถานะธุรกิจหาก payload ขาดฟิลด์, enum ผิด หรือ `schema_version` ไม่รองรับ; ส่ง per-service DLQ ทันทีหลังยืนยันการ publish และแจ้งผู้ดูแล
6. **Safe visibility:** งาน `VERIFYING`, `SUSPENDED`, `CLOSED`, `AUTO_REJECTED`, `REJECTED` และ `PENDING_REVIEW` ไม่อยู่ใน public search; ผลตรวจซ้ำ/ช้าหรือ Event ผิดลำดับต้องไม่ทำให้งานเหล่านี้เผยแพร่โดยไม่ผ่าน guard ของ Job Management
7. **Schema evolution:** เพิ่ม optional field ได้ใน `schema_version: 1` โดย Consumer ต้องมองข้าม field ที่ไม่รู้จัก; การเปลี่ยนความหมาย, ลบฟิลด์บังคับ หรือเปลี่ยนชนิดต้องเพิ่มเวอร์ชันและรองรับช่วงเปลี่ยนผ่าน

## 7. การปฏิบัติงานกับ RabbitMQ

- Exchange/queue หลักและ routing key อยู่ในข้อ 2; retry queue และ DLQ แยกต่อ consumer เป็น durable, ข้อความเป็น persistent และตั้ง TTL เฉพาะ retry queue ไม่ตั้ง TTL ใน DLQ เพื่อเก็บไว้จนผู้ดูแลตรวจและลบหรือ replay
- หลังแก้สาเหตุ ผู้ดูแล replay จาก DLQ ด้วยสคริปต์เฉพาะงานโดยรักษา envelope และ `event_id` เดิม เพิ่มบันทึกเหตุผล/เวลาที่ replay แยกจาก payload; `processed_events` ป้องกันการทำธุรกรรมซ้ำ
- Publisher ต้องใช้ confirm และตรวจ unroutable message ก่อนทำเครื่องหมาย Outbox ว่า publish สำเร็จ; การย้ายข้อความไป retry queue/DLQ ต้องยืนยันการ publish ก่อน ACK ข้อความต้นทาง เพื่อไม่ให้ข้อความหายเมื่อ broker ขัดข้อง

กฎ Blacklist, ช่วงคะแนน Risk Score, การซ่อนโพสต์หลังแก้ไข, สิทธิ์รีวิวผู้ที่ Fail และระยะฝึกขั้นต่ำ 30 วันยังคงใช้ตามเอกสารหลักและ API Contract

ตาราง Outbox/Inbox และหลักฐานที่ Consumer บันทึกอยู่ใน `docs/database-schema.md`
