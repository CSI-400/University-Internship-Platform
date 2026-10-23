# Project Setup Handoff — Week 1

**สถานะ:** โครงสร้างและ dependencies เตรียมแล้ว; ยังไม่มี implementation ของหน้าเว็บ, service, Prisma schema, migration หรือ Docker Compose<br>
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
  postgres/               DB initialization/config ที่ทีมจะสร้าง
  rabbitmq/               Exchange/queue config ที่ทีมจะสร้าง
tests/
  fixtures/               Mock data กลาง
  integration/            Cross-service tests
  uat/                    UAT 9 cases
docs/                     SA contracts and diagrams
```

โฟลเดอร์เปล่ามี `.gitkeep` เพื่อให้ Git ติดตามได้ เจ้าของแต่ละส่วนจะเพิ่มไฟล์ source/config ภายหลังตาม diagram และ contract; ไม่ควรเอา business logic ไปไว้ที่ Gateway หรือให้ service หนึ่งแก้ database ของอีก service

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

ตั้งค่า Tailwind 4 ไว้ที่ `apps/web/postcss.config.mjs` และ `apps/web/src/app/globals.css` แล้ว เมื่อทีม UI สร้าง `apps/web/src/app/layout.tsx` ให้ import `./globals.css` ที่ไฟล์นั้นหนึ่งครั้ง จากนั้นใช้ utility classes ในหน้า `.tsx` ได้ ตัวอย่าง:

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

## 3. ติดตั้งบนเครื่องสมาชิกทีม

- ใช้ Node.js 24 LTS และ npm 11 ตาม `package.json`
- ที่ root รัน `npm ci` (บน PowerShell ที่บล็อก `npm.ps1` ให้รัน `npm.cmd ci`)
- ตรวจ `npm ls --workspaces --depth=0` และ `npm install-scripts ls`; dependency install scripts ที่จำเป็นถูก pin ใน `allowScripts` ของ root package แล้ว
- `node_modules/` ไม่อยู่ใน Git; ให้ commit/ดึง `package.json`, workspace manifests และ `package-lock.json` เท่านั้น
- ตอนนี้ยังสั่ง `dev` หรือ `build` ไม่ได้ เพราะ PM ให้เตรียมโฟลเดอร์/dependencies ก่อนและให้เจ้าของแต่ละส่วนสร้างไฟล์ source เอง

## 4. ข้อตกลงสำหรับไฟล์ config ที่ทีมจะสร้าง

| ส่วน | ค่า/ขอบเขตที่ต้องใช้ |
| --- | --- |
| Web | เสนอ port `3000`; Browser เรียก Gateway ผ่าน public base URL, server-side request ใช้ internal URL ของ Compose |
| Gateway | เสนอ port `3001`; map route `/v1` ตาม API Contract; ใช้ public key ตรวจ JWT |
| Identity / Job / Verification / Student | เสนอ internal ports `3002` / `3003` / `3004` / `3005` ตามลำดับ; API ภายในใช้ `/internal/v1` และไม่เปิดให้ Browser ตรง |
| e-KYB Mock | เสนอ internal port `3006`; Identity เรียกผ่าน adapter เท่านั้น |
| PostgreSQL | 1 instance, 4 databases และ 4 DB users; แต่ละ service ใช้ `DATABASE_URL` ของตน; Gateway/Web/Mock ไม่มี DB user |
| RabbitMQ | topic exchange `internship.events.v1`, durable queues/retry/DLQ ตาม Event Contract; credentials ผ่าน environment/secrets |
| Files | Identity mount KYB private volume; Student Experience mount Resume/Certificate private volume |
| JWT | Identity ถือ ES256 private key; Gateway และบริการปลายทางถือ public key; secret/key ไม่ commit |

ค่า port เป็นข้อเสนอเพื่อให้ Compose และ environment ตัวแรกตรงกัน ผู้เขียน Compose ต้องบันทึกค่าที่ใช้จริงกลับมาในเอกสารนี้หากต่างจากตาราง

## 5. เงื่อนไขก่อนเริ่มฟีเจอร์

1. เจ้าของ service สร้างไฟล์ Nest/Next config และ source ใน path ของตนเอง โดยใช้ contract/diagram นี้เป็นจุดเริ่ม
2. เจ้าของ DB สร้าง Prisma schema, migration และ `prisma.config.ts` ใน service ของตน; Prisma 7 ใช้ PostgreSQL driver adapter ตามเอกสารทางการ
3. ผู้ดูแล infra เพิ่ม Compose, PostgreSQL init และ RabbitMQ topology; ทดสอบว่า 4 service ต่อ DB ของตัวเองและ Event ไปถึง queue ถูกตัว
4. Tester ใช้ Mocha ทดสอบ unit/API integration และ UAT 9 เคสตาม [README หลัก](../README.md)
