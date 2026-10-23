# AI working guide

คำแนะนำนี้ใช้กับทั้ง repository เพื่อให้ AI coding agent อ่านข้อกำหนดของโครงการก่อนแก้งาน

## ก่อนเริ่มงาน

1. อ่าน [สารบัญเอกสาร](docs/README.md) เพื่อหาเอกสารที่เกี่ยวข้องกับงาน
2. อ่านส่วนที่เกี่ยวข้องใน [README หลัก](README.md), [Verification Rules & Risk Score](<Verification Rules & Risk Sco.txt>) และ [TODO](TODO.txt) เพื่อเข้าใจขอบเขตธุรกิจ กฎ Risk Score และผู้รับผิดชอบ
3. อ่านเอกสาร SA ที่ตรงกับงานก่อนแก้โค้ดหรือออกแบบ ไม่จำเป็นต้องอ่านทุก diagram ในทุกงาน:
   - โครงบริการและขอบเขตข้อมูล: [Architecture](docs/architecture.md)
   - HTTP endpoints, roles และ error: [API Contract](docs/api-contract.md)
   - Event และ RabbitMQ: [Event Contract](docs/event-contract.md)
   - ตารางและ migration: [Database Schema](docs/database-schema.md)
   - หน้าจอและ UX: [Design](docs/design.md)
   - คำสั่งรันและโครงโปรเจกต์: [Project Setup](docs/project-setup.md)
   - Flow และความสัมพันธ์ของระบบ: [Diagrams](docs/diagrams.md)

## ระหว่างทำงาน

- ไฟล์ที่ root ซึ่ง PM ดูแลเป็นข้อกำหนดธุรกิจหลัก; เอกสารใน `docs/` ขยายรายละเอียดเพื่อพัฒนา หากพบข้อขัดแย้ง ให้ระบุจุดที่ขัดกันและยึดข้อตกลงล่าสุดที่ทีมยืนยัน ไม่แก้ไฟล์ของ PM เองโดยไม่มีคำสั่ง
- ทำตามเจ้าของข้อมูลของแต่ละ service ใน Architecture และ Database Schema; ห้ามอ่านหรือเขียนฐานข้อมูลของ service อื่นโดยตรง
- เมื่อเปลี่ยน API, Event, schema หรือ flow ให้ตรวจและปรับเอกสารที่เกี่ยวข้องพร้อมโค้ด เพื่อไม่ให้ contract กับ implementation ต่างกัน
- ใช้คำสั่งและสภาพแวดล้อมใน Project Setup; ตรวจงานด้วยคำสั่งหรือการทดสอบที่ตรงกับส่วนที่แก้ และรายงานสิ่งที่ยังไม่ได้ตรวจ
- อย่าเพิ่ม `.env`, `.local/`, private keys, `node_modules/`, `dist/`, `.next/` หรือไฟล์ที่เครื่องมือสร้างลง Git
- ห้าม commit, push, สร้าง PR หรือ merge โดยไม่มีคำสั่งจากผู้ใช้สำหรับการกระทำนั้น
