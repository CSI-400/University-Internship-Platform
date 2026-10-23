# Project Setup Handoff — Week 1

**สถานะ:** มี starter ที่ build ได้สำหรับ Web, Gateway และ 5 services พร้อม Docker Compose, PostgreSQL 4 ฐาน, RabbitMQ topology และ Prisma config ขั้นต่ำ; ยังไม่มี business logic, domain models หรือ migration<br>
**ลำดับอ่าน:** [สารบัญเอกสาร](README.md) → [Database Schema](database-schema.md) → เอกสารนี้<br>
**อ้างอิง:** `docs/diagrams.md`, `docs/architecture.md`, `docs/api-contract.md`, `docs/event-contract.md`, `docs/database-schema.md`

## 1. โครงสร้างที่เตรียม

Repository ใช้ npm workspaces จาก `package.json` ที่ root และ lock เวอร์ชันด้วย `package-lock.json`:

```text
apps/
  web/                    Next.js UI (src/app, src/components, src/lib, test)
  api-gateway/            NestJS Gateway (src, test)
services/
  identity/               NestJS + Prisma: identity_db (src, prisma/migrations, test)
  job-management/         NestJS + Prisma: job_db (src, prisma/migrations, test)
  verification-trust/     NestJS + Prisma: verification_db (src, prisma/migrations, test)
  student-experience/     NestJS + Prisma: student_db (src, prisma/migrations, test)
  ekyb-mock/              NestJS Mock HTTP (src, test)
infra/
  docker/                 Dockerfile สำหรับ development
  postgres/               สร้าง 4 databases และ 4 users ตอน volume ว่าง
  rabbitmq/               ประกาศ exchange, queue, retry และ DLQ
tests/
  fixtures/               Mock data กลาง
  integration/            Cross-service tests
  uat/                    UAT 9 cases
docs/                     SA contracts and diagrams
```

แต่ละ workspace มี `package.json`, TypeScript config และ starter entry point; Web มี `layout.tsx`/`page.tsx` ส่วน NestJS ทุกตัวมี `GET /health` เท่านั้น โฟลเดอร์งานที่ยังว่างมี `.gitkeep` เพื่อให้ Git ติดตามได้ เจ้าของแต่ละส่วนจะเพิ่ม business logic ตาม diagram และ contract; ไม่ควรเอา business logic ไปไว้ที่ Gateway หรือให้ service หนึ่งแก้ database ของอีก service

## 2. Dependencies ที่ลงไว้

| ส่วน | Package หลัก |
| --- | --- |
| Web | `next`, `react`, `react-dom`, `apexcharts`, `react-apexcharts`; Tailwind CSS 4, `@tailwindcss/postcss`, `postcss` เป็น dev dependencies และ TypeScript/types ที่ root |
| Gateway | NestJS 12, DTO validation, `jose` สำหรับตรวจ ES256 JWT |
| 4 Services | NestJS 12, Prisma ORM 7, PostgreSQL adapter/driver (`@prisma/adapter-pg`, `pg`), DTO validation, `jose`, `amqplib` |
| Identity | `argon2` สำหรับ password, `multer` สำหรับ KYB upload |
| Student Experience | `multer` สำหรับ Resume, `pdf-lib` สำหรับ Certificate |
| e-KYB Mock | NestJS HTTP service; ไม่ต่อฐานข้อมูลจริง |
| Test | Mocha, Chai, Supertest, `@nestjs/testing`, `tsx` และ TypeScript/types ที่ root |

เลือก Prisma 7 เพราะเวอร์ชัน 8 ยังเป็น release candidate ณ วันที่ออกแบบ; pin CLI, Client และ PostgreSQL adapter ภายใน major 7 เดียวกัน ทั้งทีมใช้ lockfile เดียวกัน ไม่ติดตั้ง `prisma@latest` แยกเอง

### Tailwind CSS บน Next.js

ตั้งค่า Tailwind 4 ไว้ที่ `apps/web/postcss.config.mjs` และ `apps/web/src/app/globals.css` แล้ว `layout.tsx` import CSS ไว้หนึ่งครั้ง ทีม UI สามารถใช้ utility classes ในหน้า `.tsx` ได้ ตัวอย่าง layout ปัจจุบัน:

```tsx
import './globals.css';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
```

ยังไม่ต้องสร้าง `tailwind.config.js` หรือใช้คำสั่ง `npx tailwindcss init` สำหรับการตั้งค่าพื้นฐานของ Tailwind 4

### กราฟ ApexCharts บน Next.js

เมื่อต้องทำหน้ากราฟ ให้โหลด `react-apexcharts` ด้วย `next/dynamic` ใน Client Component และตั้ง `ssr: false` เพราะไลบรารีกราฟต้องใช้ `window` ของเบราว์เซอร์ ตัวอย่างสำหรับไฟล์ `.tsx` ใน `apps/web/src/components/`:

```tsx
'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const options: ApexOptions = {
  chart: { type: 'bar' },
  xaxis: { categories: ['Jan', 'Feb', 'Mar'] },
};

export function ExampleChart() {
  return (
    <Chart
      type="bar"
      options={options}
      series={[{ name: 'Internships', data: [4, 6, 5] }]}
      height={300}
    />
  );
}
```

`ssr: false` ต้องอยู่ใน Client Component; การใส่ `'use client'` อย่างเดียวไม่ปิดการ prerender ฝั่ง server ของกราฟ และไม่ควร import `react-apexcharts` แบบ runtime ตรงใน Server Component

## 3. เริ่มระบบบนเครื่องทีม

ต้องมี Node.js 24/npm 11 และ Docker Desktop หรือ Docker Engine ที่ใช้ Compose V2 ได้ เปิด Docker daemon ก่อนรันคำสั่ง จาก root ของ repo:

```powershell
npm.cmd run setup:local
docker compose config
docker compose up --build -d
docker compose ps
```

`setup:local` สร้าง `.env` จาก `.env.example` และคู่กุญแจ JWT ES256 ใน `.local/keys/` เมื่อยังไม่มีไฟล์ โดยไม่เขียนทับไฟล์เดิม ทั้งสองตำแหน่งถูก ignore จาก Git ใช้ค่ารหัสผ่านตัวอย่างเฉพาะเครื่องเดโมในวงปิดและแก้ใน `.env` ก่อนแชร์เครื่อง เมื่อเปลี่ยนรหัสฐานข้อมูลหลังเคยเริ่มระบบแล้ว ต้องปรับรหัสในฐานข้อมูลเดิมด้วย เพราะสคริปต์ init ทำงานเฉพาะตอน volume ว่าง

- Web: <http://localhost:3000> และ Gateway health: <http://localhost:3001/health>
- RabbitMQ Management: <http://localhost:15672> ใช้บัญชีจาก `.env`
- PostgreSQL `5432` และ RabbitMQ AMQP `5672` เปิดเฉพาะ `127.0.0.1`; 4 services และ e-KYB Mock อยู่ในเครือข่าย Compose ภายใน
- `docker compose down` หยุดระบบโดยเก็บข้อมูลใน named volumes ไว้; `docker compose down -v` ลบข้อมูลเดโมและไฟล์ส่วนตัวทั้งหมดใน volumes
- Code ของแต่ละ workspace mount เข้า container สำหรับแก้แล้ว reload; เมื่อแก้ dependencies ให้ rebuild image ด้วย `docker compose up --build -d`

หากพัฒนานอก Docker ใช้ Node.js 24 และ npm 11 ตาม root `package.json`, รัน `npm.cmd ci`, `npm.cmd run typecheck` และ `npm.cmd run build` ได้ ส่วน PostgreSQL/RabbitMQ ต้องรันแยกและตั้ง environment ให้ตรงกับ service; `node_modules/`, `.next/` และ `dist/` ไม่อยู่ใน Git

## 4. ค่า config ที่เตรียมใน Compose

| ส่วน | ค่า/ขอบเขตที่ต้องใช้ |
| --- | --- |
| Web | port `3000`; `NEXT_PUBLIC_API_BASE_URL` ชี้ Gateway ฝั่ง browser และ `INTERNAL_API_BASE_URL` ชี้ Gateway ภายใน Compose |
| Gateway | port `3001`; มี URL ของแต่ละ service และ public key สำหรับตรวจ JWT; route `/v1` ยังต้อง implement ตาม API Contract |
| Identity / Job / Verification / Student | internal ports `3002` / `3003` / `3004` / `3005`; แต่ละตัวได้ `DATABASE_URL` ของตัวเองและ `RABBITMQ_URL`; API `/internal/v1` ยังต้อง implement |
| e-KYB Mock | internal port `3006`; HTTP mock response ยังต้อง implement ตาม adapter contract |
| PostgreSQL | 1 instance, 4 databases และ 4 DB users; Gateway/Web/Mock ไม่มี DB user |
| RabbitMQ | topic exchange `internship.events.v1`, durable consumer queues, retry 5/30/120 วินาทีและ DLQ ตาม Event Contract; consumer/publisher logic ยังต้อง implement |
| Files | Identity mount KYB private volume; Student Experience mount Resume/Certificate private volume |
| JWT | Identity mount ES256 private/public key; Gateway และบริการปลายทาง mount เฉพาะ public key; key ไม่ commit |

`GET /health` ปัจจุบันบอกเพียงว่า Nest process ตอบ HTTP ได้ ยังไม่ตรวจการเชื่อม DB, Broker หรือความพร้อมของฟีเจอร์ ทีมเจ้าของ service ต้องเพิ่ม readiness check เมื่อเขียน integration จริง

## 5. งานที่แต่ละทีมเริ่มต่อ

1. เจ้าของ Web เพิ่ม UI ตาม API Contract; ใช้ Tailwind และตัวอย่าง dynamic import ของ ApexCharts ด้านบน
2. เจ้าของ Gateway เพิ่มการตรวจ JWT, การส่งต่อ `/v1` และ error mapping โดยเรียก service ผ่าน URL ที่ Compose กำหนด
3. เจ้าของ Identity/Job/Verification/Student เติม models ใน `prisma/schema.prisma` ตาม [Database Schema](database-schema.md), สร้าง migration ของฐานตนเอง และใช้ PostgreSQL driver adapter ของ Prisma 7; starter ยังไม่มี domain model จึงยังไม่ควรรัน migration
4. เมื่อเติม model แล้ว ตรวจจาก container เช่น `docker compose exec identity npm run db:validate -w @uip/identity`, ต่อด้วย `db:generate` และ `db:migrate` โดยเปลี่ยน workspace ตาม service
5. เจ้าของ Event เพิ่ม Outbox publisher และ Inbox consumer ตาม [Event Contract](event-contract.md); topology ถูกสร้างโดย `rabbitmq-init` แล้ว แต่ starter ยังไม่ส่งหรือรับ Event
6. Tester ใช้ Mocha ทดสอบ unit/API integration และ UAT 9 เคสตาม [README หลัก](../README.md)

เครื่องที่ใช้จัดทำ starter นี้ไม่มี Docker จึงตรวจได้เพียง YAML, TypeScript, Next/Nest build และ Prisma schema validation; ทีมต้องรัน `docker compose up --build -d` และตรวจ PostgreSQL/RabbitMQ บนเครื่องที่มี Docker ก่อนเริ่มงานร่วมกัน
