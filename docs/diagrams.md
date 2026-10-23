# Design Diagrams — University Internship Platform

**สถานะ:** แผนภาพอ้างอิงสำหรับเดโม 4 สัปดาห์ ปรับตาม contract ที่ทีมตกลง<br>
**ลำดับอ่าน:** [สารบัญเอกสาร](README.md) → [System Architecture](architecture.md) → เอกสารนี้<br>
**อ้างอิง:** [README หลัก](../README.md), [TODO](../TODO.txt), [API Contract](api-contract.md), [Event Contract](event-contract.md), [Database Schema](database-schema.md)

แผนภาพนี้ใช้ชื่อ service, database, endpoint และ event ตาม contract ปัจจุบัน ถ้าเปลี่ยน contract ให้แก้แผนภาพที่เกี่ยวข้องด้วย ภาพเป็นภาพรวม; ฟิลด์ เงื่อนไข และสิทธิ์ที่ละเอียดให้ยึดเอกสาร contract

**ภาพหลักเรียงตามที่ PM ขอในข้อ 1–7** แล้วตามด้วยภาพ State และรายการส่งต่องานในข้อ 8–9 Use Case และ Activity ใช้ Mermaid `flowchart` พร้อมสัญลักษณ์ actor, use case, action และ decision เพื่อให้ Markdown preview แสดงผลได้

## 1. Use Case Diagram — ผู้ใช้งานกับความสามารถหลัก

```mermaid
flowchart LR
    STU[Student]
    HR[Company HR]
    ADM[Platform Admin]
    SUP[Supervisor]

    subgraph SYS[University Internship Platform]
        U1([Register and login])
        U2([Manage student profile and resume])
        U3([Search and apply for jobs])
        U4([Report a published job])
        U5([Review completed internship])
        U6([Register company and submit KYB])
        U7([Create and edit job])
        U8([Manage applications and assess intern])
        U9([Decide KYB submission])
        U10([Review job and report cases])
        U11([Maintain blacklist keywords])
        U12([Record on-site verification])
        U13([Approve certificate])
    end

    STU --- U1
    STU --- U2
    STU --- U3
    STU --- U4
    STU --- U5
    HR --- U1
    HR --- U6
    HR --- U7
    HR --- U8
    ADM --- U1
    ADM --- U9
    ADM --- U10
    ADM --- U11
    SUP --- U1
    SUP --- U12
    SUP --- U13
```

Student ที่ฝึกจบแล้วรีวิวได้ทั้งผล PASS และ FAIL; Certificate อนุมัติได้เฉพาะ PASS และระยะฝึกอย่างน้อย 30 วัน HR เผยแพร่ประกาศได้หลังผ่าน KYB และผล Risk Score ตามกฎ

## 2. Activity Diagram — การส่งตรวจและเผยแพร่ประกาศ

```mermaid
flowchart TD
    START((Start)) --> HR[HR submits a draft or edits a published job]
    HR --> KYB{Company KYB approved and HR owns job?}
    KYB -->|No| DENY[Reject request and keep job hidden]
    KYB -->|Yes| HIDE[Save current content, increase job_version, set VERIFYING and hide job]
    HIDE --> EVENT[Write JobSubmitted or JobEdited to outbox]
    EVENT --> BLACKLIST{Blacklist keyword found?}
    BLACKLIST -->|Yes| AUTO_REJECT[AUTO_REJECTED]
    BLACKLIST -->|No| SCORE[Calculate Risk Score using current trust context]
    SCORE --> LOW{Score below 20?}
    LOW -->|Yes| AUTO_APPROVE[Publish current version]
    LOW -->|No| MID{Score from 20 to 69?}
    MID -->|No| AUTO_REJECT
    MID -->|Yes| QUEUE[Set PENDING_REVIEW and open Admin case]
    QUEUE --> DECISION{Admin approves current version?}
    DECISION -->|No| REJECTED[REJECTED]
    DECISION -->|Yes| GUARD{Version matches and no moderation hold?}
    AUTO_APPROVE --> GUARD
    GUARD -->|Yes| PUBLISHED[PUBLISHED and visible in public search]
    GUARD -->|No| HIDDEN[Keep hidden; reject stale verdict]
    DENY --> ENDNODE((End))
    AUTO_REJECT --> ENDNODE
    REJECTED --> ENDNODE
    PUBLISHED --> ENDNODE
    HIDDEN --> ENDNODE
```

การแก้ประกาศที่เผยแพร่แล้วต้องซ่อนก่อนตรวจใหม่ทันที; ผลตรวจที่อ้าง `job_version` เก่าไม่ทำให้เผยแพร่กลับ และ blacklist มาก่อนการพิจารณาช่วงคะแนน

## 3. Sequence Diagram — การไหลข้ามบริการ

### 3.1 สมัครบริษัทและ e-KYB

```mermaid
sequenceDiagram
    actor HR
    participant Web
    participant Gateway
    participant Identity
    participant Files as KYB volume
    participant Mock as e-KYB Mock
    actor Admin
    HR->>Web: Register company / login
    Web->>Gateway: POST /v1/auth/companies/register
    Gateway->>Identity: Forward request
    Identity-->>Gateway: HR user + Company Tier 0
    HR->>Web: Upload KYB document
    Web->>Gateway: POST /v1/companies/me/kyb-submissions
    Gateway->>Identity: Authenticated upload
    Identity->>Files: Validate and store private file
    Identity->>Mock: Verify registration via adapter
    Mock-->>Identity: Mock result or error
    Identity-->>Gateway: 202 PENDING_EXTERNAL / later PENDING_ADMIN
    Admin->>Gateway: View submission and document
    Gateway->>Identity: Check Admin role
    Admin->>Gateway: APPROVE or REJECT
    Gateway->>Identity: POST decision
    Identity->>Identity: Transaction: decision + tier history + outbox
    Identity-->>Gateway: Approved Tier 1 or rejected
```

ผล Mock เป็นหลักฐานประกอบเท่านั้น Admin อนุมัติจึงเป็น Tier 1; หาก Mock error ให้คง Tier 0 ตามสถานะ `EXTERNAL_ERROR`

### 3.2 เข้าสู่ระบบและตรวจสิทธิ์

```mermaid
sequenceDiagram
    actor User
    participant Web
    participant Gateway
    participant Identity
    participant Service as Destination service
    User->>Web: Enter email and password
    Web->>Gateway: POST /v1/auth/login
    Gateway->>Identity: Forward credentials
    Identity->>Identity: Verify Argon2id hash and account status
    Identity-->>Gateway: JWT ES256, expires_in, user
    Gateway-->>Web: Access token (60 minutes)
    User->>Web: Request protected resource
    Web->>Gateway: Authorization Bearer token
    Gateway->>Gateway: Verify signature, iss, aud and exp
    Gateway->>Service: Forward authenticated request
    Service->>Service: Recheck token, role and data ownership
    Service-->>Gateway: Result or 401/403
    Gateway-->>Web: Result or 401/403
```

Identity ถือ private key; Gateway/บริการอื่นถือ public key ผู้ดูแลสร้างบัญชี Admin/Supervisor ผ่าน bootstrap command ก่อนเดโม

### 3.3 ส่งตรวจ แก้ และเผยแพร่ประกาศ

```mermaid
sequenceDiagram
    actor HR
    participant Gateway
    participant Job as Job Management
    participant Identity
    participant MQ as RabbitMQ
    participant Verify as Verification and Trust
    actor Admin
    HR->>Gateway: Submit or edit job
    Gateway->>Job: Authenticated request
    Job->>Identity: Check HR, KYB and Tier
    Identity-->>Job: Current posting context
    Job->>Job: Transaction: version++, VERIFYING, hide, outbox
    Job-->>Gateway: 202 VERIFYING
    Job->>MQ: JobSubmitted or JobEdited
    MQ->>Verify: Deliver event
    Verify->>Identity: Read current trust context
    Verify->>Verify: Blacklist then Risk Score
    alt Score below 20
        Verify->>MQ: JobVerificationCompleted AUTO_APPROVE
    else Score 20 to 69
        Verify->>Verify: Open Admin review case
        Admin->>Verify: Approve or reject current version
        Verify->>MQ: JobReviewDecided
    else Blacklist or score at least 70
        Verify->>MQ: JobVerificationCompleted AUTO_REJECT
    end
    MQ->>Job: Verdict with job_version
    Job->>Job: Check current version, status and moderation hold
    Job->>Job: Publish or reject and record history and outbox
```

เมื่อแก้งาน `PUBLISHED` ให้ซ่อนทันที ไม่มีหน้าแสดงเวอร์ชันเก่า และไม่รับ verdict ของ `job_version` เก่า

### 3.4 Report และการปรับ Tier

```mermaid
sequenceDiagram
    actor Student
    participant Gateway
    participant Verify as Verification and Trust
    participant Identity
    participant Job as Job Management
    participant MQ as RabbitMQ
    actor Admin
    Student->>Gateway: POST /v1/jobs/{job_id}/reports
    Gateway->>Verify: Authenticated report
    Verify->>Job: Check current publication
    Verify->>Identity: Check current company tier
    Verify->>Verify: Insert unique reporter per job
    alt Tier 1 and 3 unique reporters
        Verify->>MQ: JobSuspensionRequested
        MQ->>Job: Suspend and hide job
        Verify->>Verify: Open Admin case
    else Tier 2 / On-Site from first report
        Verify->>Verify: Open yellow Admin case
    end
    Admin->>Verify: CONFIRM or DISMISS
    alt CONFIRM valid report
        Verify->>MQ: CompanyReportConfirmed
        MQ->>Identity: Record evidence and lower Tier 2 to Tier 1
    else DISMISS
        Verify->>Verify: Keep tier unchanged
    end
```

Tier 2/On-Site ไม่ Auto-Suspend จาก Report แรก; Admin สั่งระงับงานได้แยกจากการลด Tier รายละเอียดอยู่ใน Event/API Contract

### 3.5 รับฝึก รีวิว และ Certificate

```mermaid
sequenceDiagram
    actor Student
    participant StudentSvc as Student Experience
    participant Job as Job Management
    actor HR
    actor Supervisor
    participant MQ as RabbitMQ
    participant Identity
    Student->>StudentSvc: Upload PDF resume and apply
    StudentSvc->>Job: Confirm job is PUBLISHED
    StudentSvc->>StudentSvc: Create application
    HR->>StudentSvc: Accept application and record start_date
    HR->>StudentSvc: Record PASS or FAIL with end_date
    StudentSvc->>MQ: InternshipAssessmentRecorded
    MQ->>Identity: Count PASS evidence for Tier 2
    Student->>StudentSvc: Review completed internship
    Note over Student,StudentSvc: PASS and FAIL may review with result label
    alt PASS and at least 30 days
        Supervisor->>StudentSvc: Approve certificate
        StudentSvc->>StudentSvc: Create PDF, certificate and badge
        Student->>StudentSvc: Download private PDF
    end
```

## 4. ER Diagram — แยกตามเจ้าของฐานข้อมูล

เส้นความสัมพันธ์ด้านล่างเป็นความสัมพันธ์ **ภายใน database เดียวกัน** เท่านั้น คอลัมน์ `company_id`, `job_id`, `student_id` ที่อ้างข้อมูลบริการอื่นเป็น logical reference ผ่าน API/Event ไม่สร้าง foreign key ข้าม database แผนภาพแสดงฟิลด์สำคัญ ส่วนตารางและ constraints ครบอยู่ใน `docs/database-schema.md`

### 4.1 Identity and Company KYB DB

```mermaid
erDiagram
    COMPANIES |o--o{ USERS : has_HR_users
    COMPANIES ||--o{ KYB_SUBMISSIONS : receives
    USERS ||--o{ KYB_SUBMISSIONS : submits
    COMPANIES ||--o{ COMPANY_TIER_HISTORY : records
    COMPANIES ||--o{ APPROVED_JOB_EVIDENCE : counts_jobs
    COMPANIES ||--o{ INTERNSHIP_RESULT_EVIDENCE : counts_outcomes
    COMPANIES ||--o{ CONFIRMED_REPORT_EVIDENCE : records_reports
    COMPANIES ||--o{ ON_SITE_PASS_EVIDENCE : records_visits

    USERS {
        UUID id PK
        string email_normalized UK
        string role
        UUID company_id FK
    }
    COMPANIES {
        UUID id PK
        string kyb_status
        int tier
        date on_site_verified_until
    }
    KYB_SUBMISSIONS {
        UUID id PK
        UUID company_id FK
        UUID submitted_by_user_id FK
        string status
        string document_storage_key
    }
    COMPANY_TIER_HISTORY {
        UUID id PK
        UUID company_id FK
        int previous_tier
        int new_tier
    }
    APPROVED_JOB_EVIDENCE {
        UUID job_id PK
        UUID company_id FK
        string approval_method
    }
    INTERNSHIP_RESULT_EVIDENCE {
        UUID internship_id PK
        UUID company_id FK
        string assessment_result
    }
    CONFIRMED_REPORT_EVIDENCE {
        UUID report_review_id PK
        UUID company_id FK
        UUID job_id
    }
    ON_SITE_PASS_EVIDENCE {
        UUID verification_id PK
        UUID company_id FK
        date visited_on
    }
```

`USERS.company_id` เป็น nullable สำหรับ Student/Admin/Supervisor; evidence IDs ที่มาจาก service อื่นไม่มี FK ไปยังต้นทาง

### 4.2 Job Management DB

```mermaid
erDiagram
    JOBS ||--o{ JOB_STATUS_HISTORY : has_history

    JOBS {
        UUID id PK
        UUID company_id
        UUID created_by_hr_id
        string status
        bool is_featured
        int current_version
        bool moderation_hold
    }
    JOB_STATUS_HISTORY {
        UUID id PK
        UUID job_id FK
        int job_version
        string new_status
        datetime changed_at
    }
```

`JOBS` เก็บเนื้อหาปัจจุบันเท่านั้น; `is_featured` ใช้แสดงป้ายและเรียงงานที่ `PUBLISHED` ในเดโม โดยไม่ข้ามการตรวจงาน; `current_version` ใช้กันผลตรวจเก่า ไม่ใช่ระบบแสดงประกาศเวอร์ชันเก่า

### 4.3 Verification and Trust DB

```mermaid
erDiagram
    RISK_POLICY_VERSIONS ||--o{ JOB_VERIFICATIONS : used_by
    JOB_VERIFICATIONS ||--o| JOB_REVIEW_CASES : may_open
    REPORT_REVIEW_CASES ||--o{ REPORT_REVIEW_DECISIONS : has_decisions

    RISK_POLICY_VERSIONS {
        int version PK
        json config
    }
    JOB_VERIFICATIONS {
        UUID id PK
        UUID job_id
        int job_version
        int policy_version FK
        int risk_score
        string verdict
    }
    JOB_REVIEW_CASES {
        UUID id PK
        UUID verification_id FK
        string status
    }
    REPORTS {
        UUID id PK
        UUID job_id
        UUID reporter_student_id
        string reason_code
    }
    REPORT_REVIEW_CASES {
        UUID id PK
        UUID job_id UK
        string status
    }
    REPORT_REVIEW_DECISIONS {
        UUID id PK
        UUID report_review_id FK
        string decision
    }
    ON_SITE_VERIFICATIONS {
        UUID id PK
        UUID company_id
        UUID supervisor_user_id
        string result
    }
```

`REPORTS` กับ `REPORT_REVIEW_CASES` เชื่อมกันด้วย `job_id` เชิงธุรกิจและการนับผู้รายงานไม่ซ้ำ ไม่ได้มี FK ตรงระหว่างสองตาราง

### 4.4 Student Experience DB

```mermaid
erDiagram
    RESUME_FILES ||--o{ APPLICATIONS : attached_to
    APPLICATIONS ||--o| INTERNSHIPS : may_become
    INTERNSHIPS ||--o| REVIEWS : may_receive
    INTERNSHIPS ||--o{ CERTIFICATE_DECISIONS : has_decisions
    INTERNSHIPS ||--o| CERTIFICATES : may_issue
    CERTIFICATES ||--o{ STUDENT_BADGES : grants

    STUDENT_PROFILES {
        UUID student_id PK
        string university
        string major
    }
    RESUME_FILES {
        UUID id PK
        UUID student_id
        string storage_key
    }
    APPLICATIONS {
        UUID id PK
        UUID job_id
        UUID student_id
        UUID resume_id FK
        string status
    }
    INTERNSHIPS {
        UUID id PK
        UUID application_id FK, UK
        date start_date
        date end_date
        string assessment_result
    }
    REVIEWS {
        UUID id PK
        UUID internship_id FK, UK
        int rating
        string assessment_result
    }
    CERTIFICATE_DECISIONS {
        UUID id PK
        UUID internship_id FK
        string decision
    }
    CERTIFICATES {
        UUID id PK
        UUID internship_id FK, UK
        string document_storage_key
    }
    STUDENT_BADGES {
        UUID id PK
        UUID certificate_id FK
        string badge_type
    }
```

`STUDENT_PROFILES.student_id`, `RESUME_FILES.student_id` และ `APPLICATIONS.student_id` อ้าง User ID จาก Identity เชิงตรรกะ ไม่มี FK ข้าม service

## 5. Class Diagram — โครงออกแบบภายในบริการ

```mermaid
classDiagram
    class IdentityService {
        +registerUser()
        +submitKyb()
        +decideKyb()
        +evaluateTier()
    }
    class JobManagementService {
        +createDraft()
        +submitOrEdit()
        +applyVerificationVerdict()
        +suspendJob()
    }
    class VerificationTrustService {
        +checkBlacklist()
        +calculateRiskScore()
        +recordReport()
        +decideReviewCase()
    }
    class StudentExperienceService {
        +applyForJob()
        +completeInternship()
        +createReview()
        +approveCertificate()
    }
    class EkybProvider {
        <<interface>>
        +verifyRegistration()
    }
    class EkybMockAdapter {
        +verifyRegistration()
    }
    class EventPublisher {
        <<interface>>
        +publishFromOutbox()
    }
    class PrismaRepository {
        <<interface>>
        +transaction()
    }

    EkybProvider <|.. EkybMockAdapter : implements
    IdentityService ..> EkybProvider : calls
    IdentityService ..> EventPublisher : emits_events
    JobManagementService ..> EventPublisher : emits_events
    VerificationTrustService ..> EventPublisher : emits_events
    StudentExperienceService ..> EventPublisher : emits_events
    IdentityService ..> PrismaRepository : owns_identity_db
    JobManagementService ..> PrismaRepository : owns_job_db
    VerificationTrustService ..> PrismaRepository : owns_verification_db
    StudentExperienceService ..> PrismaRepository : owns_student_db
```

นี่เป็น **class design เชิงตรรกะ** ก่อนสร้างไฟล์จริง ไม่ได้กำหนดว่าทุก service ต้อง import `PrismaRepository` class เดียวกัน; แต่ละบริการมี repository/Prisma Client ของตัวเอง การสื่อสารข้ามบริการใช้ HTTP API และ Event ตาม contract

## 6. System Architecture Diagram — โครงสร้างและการจัดวาง

### 6.1 Structure Diagram — ที่อยู่ของงานแต่ละทีม

```mermaid
flowchart TB
    ROOT[Repository]
    ROOT --> DOCS[docs: SA contracts and diagrams]
    ROOT --> APPS[apps]
    ROOT --> SERVICES[services]
    ROOT --> INFRA[infra: Compose and broker/database setup]
    ROOT --> TESTS[tests: cross-service integration and UAT]
    APPS --> WEB[web: Next.js TSX]
    APPS --> GW[api-gateway: NestJS]
    SERVICES --> ID[identity: SA]
    SERVICES --> JOB[job-management: Junior]
    SERVICES --> VERIFY[verification-trust: PM]
    SERVICES --> STUDENT[student-experience: Tester]
    SERVICES --> KYB[ekyb-mock: mock HTTP]
    ID --> IDPRISMA[prisma: identity_db]
    JOB --> JOBPRISMA[prisma: job_db]
    VERIFY --> VPRISMA[prisma: verification_db]
    STUDENT --> SPRISMA[prisma: student_db]
```

| Path | ขอบเขต |
| --- | --- |
| `apps/web/` | หน้าของ Student, HR, Admin และ Supervisor; เรียก Gateway เท่านั้น |
| `apps/api-gateway/` | ตรวจ JWT เบื้องต้นและส่ง route ไป service เจ้าของข้อมูล; ไม่ใช้ Prisma |
| `services/identity/` | Auth, Company, KYB, Tier และ On-Site Badge; เจ้าของ `identity_db` และ KYB volume |
| `services/job-management/` | Job, public search, publication status; เจ้าของ `job_db` |
| `services/verification-trust/` | Blacklist, Risk Score, คิวตรวจ, Report และ On-Site visit; เจ้าของ `verification_db` |
| `services/student-experience/` | Profile, Resume, Application, Internship, Review, Certificate; เจ้าของ `student_db` และไฟล์นักศึกษา |
| `services/ekyb-mock/` | HTTP mock หลัง Identity adapter ไม่มีฐานข้อมูลธุรกิจ |
| `infra/` | Docker Compose, การตั้งค่า PostgreSQL/RabbitMQ และ volume |
| `tests/` | Integration ข้ามบริการ, mock fixtures และ UAT 9 เคส |

ทุก Nest service ที่เป็นเจ้าของ DB วาง `prisma/` (schema และ migrations), `src/` (ไฟล์บริการ) และ `test/` (unit/API test) ใน service ของตน; Gateway กับ Mock มี `src/` และ `test/`; Web มี `src/app/`, `src/components/`, `src/lib/` และ `test/` โฟลเดอร์ที่เตรียมไว้ยังไม่มีไฟล์ฟีเจอร์ ผู้รับผิดชอบสร้างภายหลัง

### 6.2 Deployment Diagram — เดโมบนเครื่องเดียว

```mermaid
flowchart LR
    B[Browser] -->|HTTP| WEB[Next.js web]
    WEB -->|HTTP /v1| GW[NestJS API Gateway]
    GW -->|internal HTTP| ID[Identity]
    GW -->|internal HTTP| JOB[Job Management]
    GW -->|internal HTTP| VERIFY[Verification and Trust]
    GW -->|internal HTTP| STUDENT[Student Experience]
    ID -->|HTTP adapter| MOCK[e-KYB Mock]
    ID --> IDDB[(identity_db)]
    JOB --> JOBDB[(job_db)]
    VERIFY --> VDB[(verification_db)]
    STUDENT --> SDB[(student_db)]
    IDDB --- PG[(PostgreSQL instance)]
    JOBDB --- PG
    VDB --- PG
    SDB --- PG
    ID <--> MQ[(RabbitMQ)]
    JOB <--> MQ
    VERIFY <--> MQ
    STUDENT --> MQ
    ID --> KYBV[(private KYB volume)]
    STUDENT --> FILEV[(private Resume and Certificate volume)]
```

Compose เปิดพอร์ตให้ Browser เข้า Web/Gateway ตามที่กำหนดตอน implement; PostgreSQL, RabbitMQ, Mock, private volumes และ internal service APIs อยู่ในเครือข่ายภายในเดโม ไม่เปิดไฟล์เป็น public static path PostgreSQL เป็น instance เดียวแต่แยก database และบัญชีต่อ service

### 6.3 Event Topology — RabbitMQ

```mermaid
flowchart LR
    ID[Identity outbox] --> X{internship.events.v1}
    JOB[Job outbox] --> X
    VERIFY[Verification outbox] --> X
    STUDENT[Student outbox] --> X
    X --> IQ[identity.events.v1]
    X --> JQ[job-management.events.v1]
    X --> VQ[verification-trust.events.v1]
    IQ --> IWORK[Identity consumer]
    JQ --> JWORK[Job consumer]
    VQ --> VWORK[Verification consumer]
    IWORK -->|temporary failure| IR[Identity retry queues]
    JWORK -->|temporary failure| JR[Job retry queues]
    VWORK -->|temporary failure| VR[Verification retry queues]
    IR -->|TTL / DLX| IQ
    JR -->|TTL / DLX| JQ
    VR -->|TTL / DLX| VQ
    IWORK -->|permanent error or 3 retries failed| IDLQ[Identity DLQ]
    JWORK -->|permanent error or 3 retries failed| JDLQ[Job DLQ]
    VWORK -->|permanent error or 3 retries failed| VDLQ[Verification DLQ]
```

Publisher confirm ก่อน mark Outbox ว่าส่งแล้ว; Consumer เขียน business data และ `processed_events` ใน transaction เดียวกันก่อน ACK รายชื่อ binding key อยู่ใน `docs/event-contract.md`

### 6.4 Data Ownership Diagram — ความสัมพันธ์หลัก

```mermaid
flowchart LR
    subgraph IdentityDB[identity_db]
        USERS[users] --> COMPANIES[companies]
        COMPANIES --> KYB[kyb_submissions]
        COMPANIES --> TIER[company_tier_history and evidence]
    end
    subgraph JobDB[job_db]
        JOBS[jobs] --> JH[job_status_history]
    end
    subgraph VerificationDB[verification_db]
        JV[job_verifications] --> JRC[job_review_cases]
        REPORTS[reports] --> RRC[report_review_cases]
        RRC --> RRD[report_review_decisions]
    end
    subgraph StudentDB[student_db]
        PROFILE[student_profiles] --> RESUME[resume_files]
        RESUME --> APP[applications]
        APP --> INTERN[internships]
        INTERN --> REVIEW[reviews]
        INTERN --> CERT[certificates and student_badges]
    end
    COMPANIES -. company_id via API/Event .-> JOBS
    JOBS -. job_id via API/Event .-> JV
    JOBS -. job_id via API/Event .-> APP
    RRD -. confirmed event .-> TIER
    INTERN -. assessment event .-> TIER
```

เส้นประคือ ID อ้างอิงข้าม service ผ่าน API/Event **ไม่ใช่ foreign key ข้าม database** ทุก service ที่ใช้ Event มี outbox/inbox ของตนตาม `docs/database-schema.md`

## 7. Data Flow Diagram (DFD) — Context และ Level 1

### 7.1 Context DFD

```mermaid
flowchart LR
    STU[Student] -->|Registration, application, report, review| SYS((University Internship Platform))
    HR[Company HR] -->|KYB, job, application decision, assessment| SYS
    ADM[Platform Admin] -->|KYB and moderation decisions| SYS
    SUP[Supervisor] -->|On-site and certificate decisions| SYS
    SYS -->|Search results, application status, badge, PDF| STU
    SYS -->|KYB and job status, applicants| HR
    SYS -->|Review queues and evidence| ADM
    SYS -->|Visit and certificate cases| SUP
    SYS -->|Verification request| MOCK[e-KYB Mock HTTP]
    MOCK -->|Mock result| SYS
```

### 7.2 Level 1 DFD

```mermaid
flowchart LR
    STU[Student]
    HR[Company HR]
    ADM[Platform Admin]
    SUP[Supervisor]
    MOCK[e-KYB Mock HTTP]

    P1((1 Identity and KYB))
    P2((2 Job Management))
    P3((3 Verification and Trust))
    P4((4 Student Experience))
    EV((RabbitMQ events))

    D1[(D1 identity_db)]
    D2[(D2 job_db)]
    D3[(D3 verification_db)]
    D4[(D4 student_db)]
    F1[(Private KYB files)]
    F4[(Private resume and certificate files)]

    STU -->|Account data| P1
    HR -->|Registration and KYB document| P1
    ADM -->|KYB decision| P1
    P1 -->|Check registration| MOCK
    MOCK -->|Mock result| P1
    P1 <--> D1
    P1 --> F1

    HR -->|Draft, submit and edit job| P2
    P2 <--> D2
    P2 -->|JobSubmitted or JobEdited| EV
    EV -->|Verification verdict| P2

    STU -->|Report| P3
    ADM -->|Blacklist update and review decision| P3
    SUP -->|On-site result| P3
    P3 <--> D3
    EV -->|Submitted job and trust change| P3
    P3 -->|Review, suspension and report events| EV

    STU -->|Resume, application and review| P4
    HR -->|Application decision and assessment| P4
    SUP -->|Certificate decision| P4
    P4 <--> D4
    P4 --> F4
    P4 -->|Assessment event| EV
    EV -->|Evidence and trust events| P1

    P2 -->|Current job publication context| P4
    P2 -->|Current job publication context| P3
    P1 -->|Current company trust context| P2
    P1 -->|Current company trust context| P3
    P1 -->|CompanyTrustChanged| EV
    P3 -->|Confirmed report history| P1
```

DFD แสดง **ข้อมูลที่ไหลและที่เก็บข้อมูล**; ทุก HTTP request จากผู้ใช้ผ่าน API Gateway แม้ไม่ได้วาด Gateway ซ้ำใน Level 1 เพราะ Gateway ไม่เป็นเจ้าของข้อมูลธุรกิจ เส้น Event ผ่าน RabbitMQ ตาม routing ใน `docs/event-contract.md`

## 8. State Diagrams — สถานะธุรกิจเพิ่มเติม

### 8.1 สถานะประกาศงาน

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> VERIFYING: HR submit with KYB
    VERIFYING --> PUBLISHED: auto or Admin approve
    VERIFYING --> PENDING_REVIEW: score 20 to 69
    VERIFYING --> AUTO_REJECTED: blacklist or score at least 70
    PENDING_REVIEW --> PUBLISHED: Admin approve current version
    PENDING_REVIEW --> REJECTED: Admin reject
    PUBLISHED --> VERIFYING: HR edit and hide immediately
    PUBLISHED --> SUSPENDED: moderation hold
    PUBLISHED --> CLOSED: HR close
```

การปลด `SUSPENDED` ยังไม่มี endpoint/workflow ใน API Contract v1; หากทีมเพิ่มภายหลังต้องเป็นการตัดสินของ Admin ที่ตรวจสถานะปัจจุบัน ห้าม HR submit หรือแก้เพื่อข้าม moderation hold; `CLOSED` ไม่เปิดใหม่จาก verdict ที่มาช้า

### 8.2 Trust Tier และ On-Site Badge

```mermaid
stateDiagram-v2
    [*] --> Tier0: Company registered
    Tier0 --> Tier1: KYB approved by Admin
    Tier1 --> Tier2: 3 distinct published jobs + 1 PASS + no confirmed report
    Tier2 --> Tier2OnSite: Supervisor PASS on-site visit
    Tier2OnSite --> Tier2: On-site badge expires
    Tier2 --> Tier1: Admin confirms valid report
    Tier2OnSite --> Tier1: Admin confirms valid report and hides badge
```

Report ที่ยังไม่ยืนยันหรือถูก DISMISS ไม่เปลี่ยน Tier; การเลื่อน Tier 2 ตรวจข้อมูลล่าสุดจาก Verification ก่อนเสมอ

## 9. ก่อนเริ่มเขียนไฟล์ฟีเจอร์

1. เจ้าของแต่ละ service ตรวจ path, database ownership และ contract ที่ต้อง implement
2. ทีมตกลงชื่อ environment variables, ports และ Compose config ใน `infra/` ก่อนเปิด service จริง
3. เมื่อเริ่มเขียนโค้ด ให้สร้าง Prisma schema/migrations ใน service เจ้าของข้อมูล แล้วทดสอบ API และ Event ตาม diagram และ contract
4. ทดสอบ UAT ทั้ง 9 เคสใน [README หลัก](../README.md); ถ้า diagram กับ business rule ขัดกัน ให้แก้ diagram/contract ร่วมกันก่อน implement
